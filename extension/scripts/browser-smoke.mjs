#!/usr/bin/env node
import { access, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { startFixtureServer } from "./lib/fixture-server.mjs";
import { isFirefox, parseArgs, WebDriverSession } from "./lib/webdriver.mjs";

const HELP = `Usage: node scripts/browser-smoke.mjs [options]

Options:
  --browser chromium|brave|chrome|firefox|zen  Browser family (default: chromium)
  --extension PATH                         Unpacked WXT build folder
  --binary PATH                            Browser executable override
  --driver PATH                            Matching chromedriver or geckodriver
  --artifacts PATH                         Ignored screenshot/report folder
  --stress-tabs N                           Additional tabs for UI stress check (0-300)
  --cycles N                                Repeated unload/restore retention check (0-120)
  --timer-wait MS                           Exercise a real 1-minute idle alarm (e.g. 90000)
  --headed                                 Show browser window
  --help                                   Show this help

Use a driver matching the installed browser major version. Firefox and Zen need
geckodriver. Every run creates a disposable browser profile; personal profiles
are never accessed. The report records each check as passed, failed, or skipped.
`;

const pause = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));

async function requestFromExtension(driver, message) {
  return driver.executeAsync(`
    const message = arguments[0];
    const done = arguments[arguments.length - 1];
    try {
      if (globalThis.browser?.runtime?.sendMessage) {
        browser.runtime.sendMessage(message).then(done, (error) => done({ ok: false, error: String(error) }));
      } else {
        chrome.runtime.sendMessage(message, (response) => {
          const error = chrome.runtime.lastError;
          done(error ? { ok: false, error: error.message } : response);
        });
      }
    } catch (error) {
      done({ ok: false, error: String(error) });
    }
  `, [message]);
}

async function snapshot(driver) {
  const response = await requestFromExtension(driver, { type: "getSnapshot" });
  if (!response?.ok) throw new Error(response?.error ?? "getSnapshot failed");
  return response.data;
}

async function send(driver, message) {
  const response = await requestFromExtension(driver, message);
  if (!response?.ok) throw new Error(response?.error ?? `${message.type} failed`);
  return response.data;
}

function findTab(state, urlPart) {
  return state.tabs.find((tab) => tab.url.includes(urlPart));
}

async function waitForTab(driver, urlPart, predicate, label, timeout = 20000) {
  return driver.waitFor(async () => {
    const tab = findTab(await snapshot(driver), urlPart);
    return tab && predicate(tab) ? tab : null;
  }, label, timeout);
}

async function commands(driver) {
  return driver.executeAsync(`
    const done = arguments[arguments.length - 1];
    try {
      if (globalThis.browser?.commands?.getAll) {
        browser.commands.getAll().then(done, (error) => done({ error: String(error) }));
      } else {
        chrome.commands.getAll((items) => done(chrome.runtime.lastError ? { error: chrome.runtime.lastError.message } : items));
      }
    } catch (error) { done({ error: String(error) }); }
  `);
}

async function grantedPermissions(driver) {
  return driver.executeAsync(`
    const done = arguments[arguments.length - 1];
    if (globalThis.browser?.permissions?.getAll) {
      browser.permissions.getAll().then(done, error => done({ error: String(error) }));
    } else {
      chrome.permissions.getAll(value => done(chrome.runtime.lastError
        ? { error: chrome.runtime.lastError.message } : value));
    }
  `);
}

async function keyChord(driver) {
  await driver.command("POST", "/actions", {
    actions: [{
      type: "key",
      id: "keyboard",
      actions: [
        { type: "keyDown", value: "\uE009" },
        { type: "keyDown", value: "\uE008" },
        { type: "keyDown", value: "u" },
        { type: "keyUp", value: "u" },
        { type: "keyUp", value: "\uE008" },
        { type: "keyUp", value: "\uE009" },
      ],
    }],
  });
  // All keys were released above. A separate DELETE /actions can reactivate a
  // newly discarded target in Brave and distort the observed result.
}

async function switchToUrlPart(driver, urlPart) {
  for (const handle of await driver.getWindowHandles()) {
    try {
      await driver.switchWindow(handle);
      const url = await driver.command("GET", "/url");
      if (url.includes(urlPart)) return handle;
    } catch {
      // A discarded tab may replace its browser target and invalidate an old handle.
    }
  }
  throw new Error(`No browser tab has URL containing ${urlPart}`);
}

async function updateTab(driver, tabId, properties) {
  return driver.executeAsync(`
    const [tabId, properties, done] = arguments;
    try {
      if (globalThis.browser?.tabs?.update) {
        browser.tabs.update(tabId, properties).then(done, (error) => done({ error: String(error) }));
      } else {
        chrome.tabs.update(tabId, properties, (tab) => done(chrome.runtime.lastError ? { error: chrome.runtime.lastError.message } : { id: tab?.id, pinned: tab?.pinned }));
      }
    } catch (error) { done({ error: String(error) }); }
  `, [tabId, properties]);
}

async function clickCss(driver, selector) {
  const element = await driver.command("POST", "/element", { using: "css selector", value: selector });
  const id = element["element-6066-11e4-a52e-4f735466cecf"];
  await driver.command("POST", `/element/${id}/click`, {});
}

async function createBrowserTab(driver, properties) {
  return driver.executeAsync(`
    const [properties, done] = arguments;
    if (globalThis.browser?.tabs?.create) {
      browser.tabs.create(properties).then(done, (error) => done({ error: String(error) }));
    } else {
      chrome.tabs.create(properties, (tab) => done(chrome.runtime.lastError ? { error: chrome.runtime.lastError.message } : tab));
    }
  `, [properties]);
}

async function createBrowserWindow(driver, url) {
  return driver.executeAsync(`
    const [url, done] = arguments;
    if (globalThis.browser?.windows?.create) {
      browser.windows.create({ url, focused: true }).then(done, (error) => done({ error: String(error) }));
    } else {
      chrome.windows.create({ url, focused: true }, (window) => done(chrome.runtime.lastError ? { error: chrome.runtime.lastError.message } : { id: window?.id }));
    }
  `, [url]);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(HELP);
    return;
  }
  const browser = options.browser ?? "chromium";
  const stressTabs = Number(options["stress-tabs"] ?? 0);
  const cycles = Number(options.cycles ?? 0);
  const timerWait = Number(options["timer-wait"] ?? 0);
  if (!Number.isInteger(stressTabs) || stressTabs < 0 || stressTabs > 300) {
    throw new Error("--stress-tabs must be an integer from 0 to 300.");
  }
  if (!Number.isInteger(cycles) || cycles < 0 || cycles > 120) {
    throw new Error("--cycles must be an integer from 0 to 120.");
  }
  if (!Number.isInteger(timerWait) || timerWait < 0 || timerWait > 180000) {
    throw new Error("--timer-wait must be an integer from 0 to 180000 milliseconds.");
  }
  const extension = resolve(options.extension ?? (isFirefox(browser) ? ".output/firefox-mv2" : ".output/chrome-mv3"));
  await access(resolve(extension, "manifest.json"));
  const artifacts = resolve(options.artifacts ?? `test-results/browser-${browser}`);
  await mkdir(artifacts, { recursive: true });
  const report = {
    browser,
    generatedAt: new Date().toISOString(),
    extension,
    checks: [],
    driverCapabilities: null,
  };
  const fixture = await startFixtureServer();
  const driver = new WebDriverSession({
    browser,
    binary: options.binary,
    driver: options.driver,
    extension,
    headless: !options.headed,
    artifactDir: artifacts,
  });
  let dashboardHandle;
  let dashboardUrl;

  async function check(name, run) {
    const start = Date.now();
    try {
      const detail = await run();
      report.checks.push({ name, status: "passed", ms: Date.now() - start, detail });
      process.stdout.write(`PASS ${name}${detail ? ` — ${detail}` : ""}\n`);
      return true;
    } catch (error) {
      report.checks.push({ name, status: "failed", ms: Date.now() - start, error: error.message });
      process.stderr.write(`FAIL ${name} — ${error.message}\n`);
      return false;
    }
  }

  try {
    await driver.start();
    report.driverCapabilities = driver.capabilities;
    const extensionOrigin = isFirefox(browser)
      ? await driver.firefoxExtensionOrigin()
      : `chrome-extension://${await driver.extensionId()}`;
    dashboardUrl = `${extensionOrigin}/dashboard.html`;
    report.dashboardUrl = dashboardUrl;

    await check("dashboard loads and has navigation", async () => {
      await driver.navigate(`${fixture.origin}/page/main`);
      dashboardHandle = await driver.newTab(dashboardUrl);
      await driver.waitFor(() => driver.execute(
        "return !!document.querySelector('[data-testid=dashboard-app]')",
      ), "dashboard app");
      for (const section of ["tabs", "rules", "activity", "settings"]) {
        const found = await driver.execute(
          "return !!document.querySelector('[data-testid=nav-' + arguments[0] + ']')",
          [section],
        );
        if (!found) throw new Error(`Missing ${section} navigation`);
      }
      if (!findTab(await snapshot(driver), "/page/main")) {
        const created = await createBrowserTab(driver, { url: `${fixture.origin}/page/main`, active: false });
        if (created?.error) throw new Error(created.error);
        await waitForTab(driver, "/page/main", () => true, "fixture tab after dashboard launch");
      }
      await driver.screenshot(resolve(artifacts, "dashboard-light.png"));
      return "navigation and screenshot verified";
    });

    await check("required tab and webpage permissions are granted", async () => {
      await driver.switchWindow(dashboardHandle);
      const grants = await grantedPermissions(driver);
      if (grants?.error) throw new Error(grants.error);
      for (const permission of ["tabs", "storage", "alarms", "idle"]) {
        if (!grants.permissions?.includes(permission)) throw new Error(`Missing ${permission} permission`);
      }
      for (const origin of ["http://*/*", "https://*/*"]) {
        if (!grants.origins?.includes(origin)) throw new Error(`Missing ${origin} access`);
      }
      return "tabs, storage, alarms, idle, and HTTP(S) access available";
    });

    await check("native discard preserves tab and reloads on activation", async () => {
      await driver.switchWindow(dashboardHandle);
      const before = await snapshot(driver);
      const target = findTab(before, "/page/main");
      if (!target) throw new Error("Fixture tab was not tracked");
      const count = before.tabs.length;
      const result = await send(driver, { type: "unloadTab", tabId: target.id });
      if (result.status !== "done") throw new Error(`Unload returned ${result.status}: ${result.message}; target.active=${target.active}; active tabs=${JSON.stringify(before.tabs.filter((tab) => tab.active).map((tab) => ({ id: tab.id, url: tab.url })))}`);
      await waitForTab(driver, "/page/main", (tab) => tab.discarded, "discarded state");
      const after = await snapshot(driver);
      if (after.tabs.length !== count) throw new Error("Tab count changed during discard");
      await switchToUrlPart(driver, "/page/main");
      await driver.waitFor(() => driver.execute("return window.__fixtureReady === true"), "fixture reload", 30000);
      await driver.switchWindow(dashboardHandle);
      try {
        await waitForTab(driver, "/page/main", (tab) => !tab.discarded, "restored state", 3000);
        return `kept ${count} tab records`;
      } catch (error) {
        if (browser !== "zen") throw error;
        const sleeping = findTab(await snapshot(driver), "/page/main");
        if (!sleeping?.discarded) throw error;
        await send(driver, { type: "restoreTab", tabId: sleeping.id });
        await waitForTab(driver, "/page/main", (tab) => !tab.discarded, "Zen API activation");
        return `kept ${count} records; Zen WebDriver switch did not activate the tab, browser tabs.update did`;
      }
    });

    await check("Keep awake survives an explicit unload", async () => {
      await driver.switchWindow(dashboardHandle);
      const before = await snapshot(driver);
      const target = findTab(before, "/page/main");
      await send(driver, { type: "setRule", hostname: "127.0.0.1", rule: { mode: "awake" } });
      let result = await send(driver, { type: "unloadTab", tabId: target.id });
      if (result.status === "needs_confirmation") {
        result = await send(driver, { type: "unloadTab", tabId: target.id, force: true, expectedUrl: target.url });
      }
      if (result.status !== "done") throw new Error(`Explicit unload returned ${result.status}`);
      const after = await snapshot(driver);
      if (after.settings.siteRules["127.0.0.1"]?.mode !== "awake") {
        throw new Error("Keep awake rule disappeared after manual unload");
      }
      await waitForTab(driver, "/page/main", (tab) => tab.discarded, "manual discard under awake rule");
      const newTab = findTab(await snapshot(driver), "/page/main");
      await send(driver, { type: "restoreTab", tabId: newTab.id });
      await driver.switchWindow(dashboardHandle);
      await waitForTab(driver, "/page/main", (tab) => !tab.discarded, "restored Keep awake tab");
      return "rule remained active and Restore woke the page";
    });

    await check("global timer and website override precedence", async () => {
      await driver.switchWindow(dashboardHandle);
      await send(driver, { type: "setGlobalMinutes", minutes: 1 });
      let state = await snapshot(driver);
      if (findTab(state, "/page/main")?.policyMode !== "awake") {
        throw new Error("Global timer overrode Keep awake");
      }
      await send(driver, { type: "setRule", hostname: "127.0.0.1", rule: { mode: "manual" } });
      state = await snapshot(driver);
      if (findTab(state, "/page/main")?.policyMode !== "manual") {
        throw new Error("Global timer overrode Manual site rule");
      }
      await send(driver, { type: "setRule", hostname: "127.0.0.1", rule: { mode: "timed", minutes: 2 } });
      state = await snapshot(driver);
      if (findTab(state, "/page/main")?.timerMinutes !== 2) {
        throw new Error("Site timer did not override global timer");
      }
      await send(driver, { type: "setRule", hostname: "127.0.0.1", rule: { mode: "awake" } });
      await send(driver, { type: "setGlobalMinutes", minutes: null });
      return "1-minute global, Manual, Keep awake, and 2-minute site timer resolved";
    });

    await check("pinned tabs require manual confirmation", async () => {
      await driver.switchWindow(dashboardHandle);
      const target = findTab(await snapshot(driver), "/page/main");
      const updated = await updateTab(driver, target.id, { pinned: true });
      if (updated?.error) throw new Error(updated.error);
      const result = await send(driver, { type: "unloadTab", tabId: target.id });
      await updateTab(driver, target.id, { pinned: false });
      if (result.status !== "needs_confirmation") {
        throw new Error(`Pinned tab returned ${result.status} instead of confirmation`);
      }
      return "pinned page remained loaded";
    });

    await check("editing requires explicit confirmation", async () => {
      const editingHandle = await driver.newTab(`${fixture.origin}/page/editing?editing=1`);
      await driver.waitFor(() => driver.execute("return window.__fixtureReady === true"), "editing fixture");
      await pause(700);
      await driver.execute(`
        const field = document.querySelector('#draft');
        field.focus(); field.value += ' more text';
        field.dispatchEvent(new Event('input', { bubbles: true }));
      `);
      await pause(500);
      await driver.switchWindow(dashboardHandle);
      const tab = await waitForTab(driver, "/page/editing", (item) => item.safety.editing, "editing signal", 10000);
      const guarded = await send(driver, { type: "unloadTab", tabId: tab.id });
      if (guarded.status !== "needs_confirmation") {
        throw new Error(`Expected confirmation; got ${guarded.status}`);
      }
      const forced = await send(driver, { type: "unloadTab", tabId: tab.id, force: true, expectedUrl: tab.url });
      if (forced.status !== "done") throw new Error(`Confirmed unload returned ${forced.status}`);
      await waitForTab(driver, "/page/editing", (item) => item.discarded, "confirmed discard");
      return `guarded tab ${editingHandle}`;
    });

    await check("playing media requires explicit confirmation", async () => {
      const mediaHandle = await driver.newTab(`${fixture.origin}/page/media`);
      await driver.waitFor(() => driver.execute("return window.__fixtureReady === true"), "media fixture");
      await pause(500);
      await clickCss(driver, "#play");
      await driver.switchWindow(dashboardHandle);
      const mediaTab = await waitForTab(driver, "/page/media", (tab) => tab.safety.media,
        "playing media signal", 10000);
      const guarded = await send(driver, { type: "unloadTab", tabId: mediaTab.id });
      if (guarded.status !== "needs_confirmation") {
        throw new Error(`Playing media returned ${guarded.status} instead of confirmation`);
      }
      await driver.switchWindow(mediaHandle);
      await clickCss(driver, "#stop");
      await driver.switchWindow(dashboardHandle);
      return "content media signal and unload guard verified";
    });

    await check("settings export, import, and invalid-file rejection", async () => {
      await driver.switchWindow(dashboardHandle);
      const exported = await send(driver, { type: "exportSettings" });
      if (exported?.schema !== 1 || exported.settings?.siteRules?.["127.0.0.1"]?.mode !== "awake") {
        throw new Error("Settings export omitted the saved rule");
      }
      await send(driver, { type: "setRule", hostname: "127.0.0.1", rule: null });
      await send(driver, { type: "importSettings", value: exported });
      if ((await snapshot(driver)).settings.siteRules["127.0.0.1"]?.mode !== "awake") {
        throw new Error("Settings import did not restore the exported rule");
      }
      const invalid = await requestFromExtension(driver, { type: "importSettings", value: { schema: 99 } });
      if (invalid?.ok) throw new Error("Invalid settings import was accepted");
      return "versioned export, restore, and rejection verified";
    });

    await check("active tab in a second window gets a replacement", async () => {
      await driver.switchWindow(dashboardHandle);
      const created = await createBrowserWindow(driver, `${fixture.origin}/page/second-window`);
      if (created?.error) throw new Error(created.error);
      await waitForTab(driver, "/page/second-window", () => true, "second-window fixture");
      const before = await snapshot(driver);
      const target = findTab(before, "/page/second-window");
      if (!target?.active) throw new Error("Second-window fixture was not active within its window");
      const originalWindowCount = before.tabs.filter((tab) => tab.windowId === target.windowId).length;
      const result = await send(driver, { type: "unloadTab", tabId: target.id });
      if (result.status !== "done") throw new Error(`Second-window unload returned ${result.status}: ${result.message}`);
      const after = await snapshot(driver);
      const unloaded = findTab(after, "/page/second-window");
      if (!unloaded?.discarded) throw new Error("Second-window page was not discarded");
      if (after.tabs.filter((tab) => tab.windowId === target.windowId).length <= originalWindowCount) {
        throw new Error("No replacement tab was created in the second window");
      }
      return `window ${target.windowId} retained original page`;
    });

    await check("dashboard sections and dark screenshot", async () => {
      await driver.switchWindow(dashboardHandle);
      await send(driver, { type: "setTheme", theme: "dark" });
      for (const section of ["rules", "activity", "settings", "tabs"]) {
        await driver.execute(
          "document.querySelector('[data-testid=nav-' + arguments[0] + ']').click()",
          [section],
        );
        await pause(100);
      }
      await driver.screenshot(resolve(artifacts, "dashboard-dark.png"));
      return "all sections opened";
    });

    await check("unloading dashboard themes, filters, and excluded pages", async () => {
      await driver.switchWindow(dashboardHandle);
      for (const theme of ["light", "dark", "system"]) {
        await send(driver, { type: "setTheme", theme });
        await driver.execute("document.querySelector('button[aria-label=\"Refresh dashboard\"]').click()");
        await driver.waitFor(() => driver.execute(
          "return document.querySelector('select[aria-label=\"Color theme\"]')?.value === arguments[0]", [theme]
        ), `${theme} theme applied`);
        const expected = theme === "system" ? await driver.execute("return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'") : theme;
        await driver.waitFor(() => driver.execute("return document.documentElement.dataset.theme === arguments[0]", [expected]), `${theme} colors`);
        await driver.screenshot(resolve(artifacts, `dashboard-${theme}.png`));
        if (!await driver.execute("return /estimated freed now/i.test(document.body.textContent)")) throw new Error("Memory estimate overview is missing");
      }
      const excluded = await driver.execute("return [...document.querySelectorAll('.tab-row')].some(row => row.textContent.includes('Browser page · excluded') && row.querySelector('button')?.disabled)");
      if (!excluded) throw new Error("Excluded browser page has an enabled unload action");
      for (const value of ["unloaded", "loaded", "all"]) {
        await driver.execute(`
          const select = document.querySelector('select[aria-label="Filter tabs"]');
          Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, arguments[0]);
          select.dispatchEvent(new Event('change', { bubbles: true }));
        `, [value]);
        await pause(200);
        const statuses = await driver.execute("return [...document.querySelectorAll('.status-pill')].map(el => el.textContent)");
        if (value !== "all" && statuses.some(status => status.toLowerCase() !== value)) throw new Error(`${value} filter showed other statuses`);
      }
      return "light, dark, system, status filters, and excluded actions verified";
    });

    await check("Ctrl+Shift+U is registered and physically unloads the current tab", async () => {
      await driver.switchWindow(dashboardHandle);
      const registered = await commands(driver);
      if (!Array.isArray(registered)) throw new Error(`commands.getAll failed: ${JSON.stringify(registered)}`);
      const unload = registered.find((command) => command.name === "unload-current-tab");
      if (!unload) throw new Error(`Missing unload-current-tab command: ${JSON.stringify(registered)}`);
      report.shortcutRegistration = unload.shortcut || null;
      const shortcutHandle = await driver.newTab(`${fixture.origin}/page/shortcut`);
      await driver.waitFor(() => driver.execute("return window.__fixtureReady === true"), "shortcut fixture");
      await driver.execute("window.__unloaderKeys = []; window.addEventListener('keydown', event => window.__unloaderKeys.push({ key: event.key, ctrl: event.ctrlKey, shift: event.shiftKey }))");
      const pressedAt = Date.now();
      await keyChord(driver);
      // Give the browser command handler time to resolve the focused tab before
      // WebDriver switches back to the dashboard.
      await pause(750);
      await driver.switchWindow(dashboardHandle);
      try {
        const observed = await driver.waitFor(async () => {
          const state = await snapshot(driver);
          const tab = findTab(state, "/page/shortcut");
          const unloadEntry = state.activity.find((entry) => entry.action === "unload" && entry.reason === "Shortcut" && entry.at >= pressedAt);
          if (!unloadEntry) return null;
          if (tab?.discarded) return "tab stayed unloaded";
          const restoreEntry = state.activity.find((entry) => entry.action === "restore" && entry.at > unloadEntry.at);
          return restoreEntry ? "native unload fired; WebDriver reactivated the tab" : null;
        }, "shortcut unload event", 5000);
        if (!/^Ctrl\+Shift\+U$/i.test(unload.shortcut ?? "")) {
          throw new Error(`Physical key worked, but registered shortcut is ${unload.shortcut || "unbound"}`);
        }
        return observed;
      } catch {
        const state = await snapshot(driver);
        let keys = [];
        try {
          await driver.switchWindow(shortcutHandle);
          keys = await driver.execute("return window.__unloaderKeys || []");
        } catch {
          // The original WebDriver target can disappear after native discard.
        }
        throw new Error(`physical Ctrl+Shift+U did not discard; command=${unload.shortcut || "unbound"}; keys=${JSON.stringify(keys)}; tracked=${JSON.stringify(state.tabs.filter((tab) => tab.url.includes("shortcut") || tab.url.startsWith("view-source:")) .map((tab) => ({ id: tab.id, url: tab.url, discarded: tab.discarded })) )}; recentActivity=${JSON.stringify(state.activity.slice(0, 4))}`);
      }
    });

    if (cycles) await check(`${cycles} unload/restore cycles retain bounded state`, async () => {
      await driver.switchWindow(dashboardHandle);
      const created = await createBrowserTab(driver, { url: `${fixture.origin}/page/cycles`, active: false });
      if (created?.error) throw new Error(created.error);
      await waitForTab(driver, "/page/cycles", () => true, "cycle fixture");
      const initial = await snapshot(driver);
      let bytesAtCap = null;
      for (let iteration = 0; iteration < cycles; iteration += 1) {
        const current = findTab(await snapshot(driver), "/page/cycles");
        const unloaded = await send(driver, { type: "unloadTab", tabId: current.id });
        if (unloaded.status !== "done") throw new Error(`Cycle ${iteration + 1} unload returned ${unloaded.status}`);
        const sleeping = await waitForTab(driver, "/page/cycles", (tab) => tab.discarded, "cycle discard");
        await send(driver, { type: "restoreTab", tabId: sleeping.id });
        await waitForTab(driver, "/page/cycles", (tab) => !tab.discarded, "cycle restore");
        await driver.switchWindow(dashboardHandle);
        if (iteration === 49) bytesAtCap = (await snapshot(driver)).stats.storageBytes;
      }
      const final = await snapshot(driver);
      if (final.stats.trackedTabs !== initial.stats.trackedTabs) {
        throw new Error(`Tracked tabs grew from ${initial.stats.trackedTabs} to ${final.stats.trackedTabs}`);
      }
      if (final.activity.length > 100) throw new Error(`Activity grew to ${final.activity.length}`);
      if (bytesAtCap !== null && final.stats.storageBytes - bytesAtCap > 1024) {
        throw new Error(`Storage grew after the activity cap: ${bytesAtCap} to ${final.stats.storageBytes} bytes`);
      }
      return `${cycles} cycles, ${final.activity.length} recent entries, ${final.stats.storageBytes} storage bytes`;
    });

    if (timerWait) await check("real idle timer unloads an unused page but keeps a draft", async () => {
      await driver.switchWindow(dashboardHandle);
      await send(driver, { type: "setRule", hostname: "127.0.0.1", rule: null });
      await send(driver, { type: "setGlobalMinutes", minutes: 1 });
      try {
        const idleUrl = `${fixture.origin}/page/idle-timer`;
        const editUrl = `${fixture.origin}/page/idle-draft`;
        const idle = await createBrowserTab(driver, { url: idleUrl, active: false });
        const editing = await createBrowserTab(driver, { url: editUrl, active: false });
        if (idle?.error || editing?.error) throw new Error(idle?.error ?? editing?.error);
        await switchToUrlPart(driver, "/page/idle-draft");
        await driver.waitFor(() => driver.execute("return window.__fixtureReady === true"), "timer draft fixture");
        await pause(700);
        await driver.execute(`
          const field = document.querySelector('#draft');
          field.focus(); field.value = 'Do not discard this draft';
          field.dispatchEvent(new Event('input', { bubbles: true }));
        `);
        await driver.switchWindow(dashboardHandle);
        await waitForTab(driver, "/page/idle-draft", (tab) => tab.safety.editing, "timer draft safety");
        const start = Date.now();
        const sleeping = await waitForTab(driver, "/page/idle-timer", (tab) => tab.discarded,
          "one-minute idle discard", timerWait);
        const draft = findTab(await snapshot(driver), "/page/idle-draft");
        if (!draft || draft.discarded) throw new Error("Unsaved draft was unloaded by the timer");
        return `unused tab ${sleeping.id} unloaded after ${Math.round((Date.now() - start) / 1000)}s; draft stayed loaded`;
      } finally {
        await send(driver, { type: "setGlobalMinutes", minutes: null });
        await send(driver, { type: "setRule", hostname: "127.0.0.1", rule: { mode: "awake" } });
      }
    });

    if (stressTabs) await check(`${stressTabs}-tab dashboard search and virtualization`, async () => {
      await driver.switchWindow(dashboardHandle);
      for (let index = 0; index < stressTabs; index += 1) {
        const url = `${fixture.origin}/page/stress-${index}`;
        if (isFirefox(browser)) await driver.newTab(url);
        else await driver.cdp("Target.createTarget", { url });
      }
      await driver.switchWindow(dashboardHandle);
      await driver.waitFor(async () => {
        const state = await snapshot(driver);
        return state.tabs.filter((tab) => tab.url.includes("/page/stress-")).length === stressTabs;
      }, `${stressTabs} tracked stress tabs`, 120000);
      const totalTabs = (await snapshot(driver)).tabs.length;
      await driver.execute("document.querySelector('button[aria-label=\"Refresh dashboard\"]').click()");
      await driver.waitFor(() => driver.execute(
        "return Number(document.querySelector('[data-testid=nav-tabs] b')?.textContent) === arguments[0]",
        [totalTabs],
      ), "dashboard count after loading stress tabs");
      await driver.execute("document.querySelector('[data-testid=nav-tabs]').click()");
      const visible = await driver.execute("return document.querySelectorAll('[data-testid=tab-list] [role=listitem]').length");
      if (visible < 1 || visible >= stressTabs) throw new Error(`Rendered ${visible} rows for ${stressTabs} tabs`);
      await driver.screenshot(resolve(artifacts, "dashboard-300-list.png"));
      await driver.execute(`
        const list = document.querySelector('[data-testid=tab-list]');
        list.focus();
        list.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }));
      `);
      await driver.waitFor(() => driver.execute(
        "return document.querySelector('[data-testid=tab-list]').scrollTop > 0",
      ), "keyboard scroll to last virtual rows");
      await driver.execute("document.querySelector('[data-testid=tab-list]').scrollTop = 0");
      const target = `stress-${stressTabs - 1}`;
      await driver.execute(`
        const input = document.querySelector('input[aria-label="Search tabs"]');
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        setter.call(input, arguments[0]);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      `, [target]);
      await driver.waitFor(() => driver.execute(
        "return document.querySelectorAll('[data-testid=tab-list] [role=listitem]').length === 1",
      ), "filtered stress tab");
      await driver.screenshot(resolve(artifacts, "dashboard-300-tabs.png"));
      await driver.command("POST", "/window/rect", { width: 600, height: 800 });
      await driver.waitFor(() => driver.execute(
        "return window.matchMedia('(max-width: 760px)').matches",
      ), "narrow dashboard layout");
      const narrow = await driver.execute(`
        return { menuOpen: [...document.querySelectorAll('nav .nav-item')].every(el => el.getBoundingClientRect().width > 0),
          horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 2 };
      `);
      await driver.screenshot(resolve(artifacts, "dashboard-mobile-300.png"));
      await driver.command("POST", "/window/rect", { width: 1440, height: 900 });
      if (!narrow.menuOpen || narrow.horizontalOverflow) {
        throw new Error(`Narrow dashboard failed navigation or overflow: ${JSON.stringify(narrow)}`);
      }
      return `${stressTabs} tracked, ${visible} rendered, keyboard End/search and narrow navigation passed`;
    });

    await check("activity and storage statistics are available", async () => {
      await driver.switchWindow(dashboardHandle);
      const state = await snapshot(driver);
      if (!Array.isArray(state.activity) || state.activity.length === 0) {
        throw new Error("No unload activity was recorded");
      }
      if (!Number.isFinite(state.stats.storageBytes) || state.stats.storageBytes < 0) {
        throw new Error("Storage byte count is unavailable");
      }
      return `${state.activity.length} activity entries, ${state.stats.storageBytes} storage bytes`;
    });
  } catch (error) {
    report.fatal = error.message;
    process.stderr.write(`FATAL ${error.message}\n`);
  } finally {
    await driver.stop();
    await fixture.close();
    report.summary = {
      passed: report.checks.filter((item) => item.status === "passed").length,
      failed: report.checks.filter((item) => item.status === "failed").length,
      skipped: report.checks.filter((item) => item.status === "skipped").length,
    };
    await writeFile(resolve(artifacts, "report.json"), JSON.stringify(report, null, 2) + "\n");
    process.stdout.write(`Report: ${resolve(artifacts, "report.json")}\n`);
  }
  if (report.fatal || report.summary.failed) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exitCode = 1;
});

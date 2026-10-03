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

async function keyChord(driver) {
  await driver.command("POST", "/actions", {
    actions: [{
      type: "key",
      id: "keyboard",
      actions: [
        { type: "keyDown", value: "\uE009" },
        { type: "keyDown", value: "u" },
        { type: "keyUp", value: "u" },
        { type: "keyUp", value: "\uE009" },
      ],
    }],
  });
  await driver.command("DELETE", "/actions");
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

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(HELP);
    return;
  }
  const browser = options.browser ?? "chromium";
  const stressTabs = Number(options["stress-tabs"] ?? 0);
  if (!Number.isInteger(stressTabs) || stressTabs < 0 || stressTabs > 300) {
    throw new Error("--stress-tabs must be an integer from 0 to 300.");
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
  let mainHandle;
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
      mainHandle = await driver.getWindowHandle();
      dashboardHandle = await driver.newTab(dashboardUrl);
      await driver.waitFor(() => driver.execute(
        "return !!document.querySelector('[data-testid=dashboard-app]')",
      ), "dashboard app");
      for (const section of ["tabs", "rules", "usage", "stats", "activity", "settings"]) {
        const found = await driver.execute(
          "return !!document.querySelector('[data-testid=nav-' + arguments[0] + ']')",
          [section],
        );
        if (!found) throw new Error(`Missing ${section} navigation`);
      }
      await driver.screenshot(resolve(artifacts, "dashboard-light.png"));
      return "navigation and screenshot verified";
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
      await waitForTab(driver, "/page/main", (tab) => !tab.discarded, "restored state");
      return `kept ${count} tab records`;
    });

    await check("Keep awake survives an explicit unload", async () => {
      await driver.switchWindow(dashboardHandle);
      const before = await snapshot(driver);
      const target = findTab(before, "/page/main");
      await send(driver, { type: "setRule", hostname: "127.0.0.1", rule: { mode: "awake" } });
      const result = await send(driver, { type: "unloadTab", tabId: target.id });
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

    await check("settings export and invalid import", async () => {
      await driver.switchWindow(dashboardHandle);
      const exported = await send(driver, { type: "exportSettings" });
      if (exported?.schema !== 1 || exported.settings?.siteRules?.["127.0.0.1"]?.mode !== "awake") {
        throw new Error("Settings export omitted the saved rule");
      }
      const invalid = await requestFromExtension(driver, { type: "importSettings", value: { schema: 99 } });
      if (invalid?.ok) throw new Error("Invalid settings import was accepted");
      return "versioned export and rejection verified";
    });

    await check("active tab in a second window gets a replacement", async () => {
      await driver.switchWindow(dashboardHandle);
      const { handle: secondHandle } = await driver.command("POST", "/window/new", { type: "window" });
      await driver.switchWindow(secondHandle);
      await driver.navigate(`${fixture.origin}/page/second-window`);
      await driver.waitFor(() => driver.execute("return window.__fixtureReady === true"), "second-window fixture");
      await driver.switchWindow(dashboardHandle);
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
      for (const section of ["rules", "usage", "stats", "activity", "settings", "tabs"]) {
        await driver.execute(
          "document.querySelector('[data-testid=nav-' + arguments[0] + ']').click()",
          [section],
        );
        await pause(100);
      }
      await driver.screenshot(resolve(artifacts, "dashboard-dark.png"));
      return "all sections opened";
    });

    await check("Ctrl+U is registered and physically unloads the current tab", async () => {
      await driver.switchWindow(dashboardHandle);
      const registered = await commands(driver);
      if (!Array.isArray(registered)) throw new Error(`commands.getAll failed: ${JSON.stringify(registered)}`);
      const unload = registered.find((command) => command.name === "unload-current-tab");
      if (!unload) throw new Error(`Missing unload-current-tab command: ${JSON.stringify(registered)}`);
      report.shortcutRegistration = unload.shortcut || null;
      const shortcutHandle = await driver.newTab(`${fixture.origin}/page/shortcut`);
      await driver.waitFor(() => driver.execute("return window.__fixtureReady === true"), "shortcut fixture");
      await keyChord(driver);
      await driver.switchWindow(dashboardHandle);
      try {
        await waitForTab(driver, "/page/shortcut", (tab) => tab.discarded, "shortcut discard", 5000);
      } catch {
        const state = await snapshot(driver);
        throw new Error(`physical Ctrl+U did not discard; command=${unload.shortcut || "unbound"}; tracked=${JSON.stringify(state.tabs.filter((tab) => tab.url.includes("shortcut") || tab.url.startsWith("view-source:")) .map((tab) => ({ url: tab.url, discarded: tab.discarded })) )}`);
      }
      if (!/^Ctrl\+U$/i.test(unload.shortcut ?? "")) {
        throw new Error(`Physical key worked, but registered shortcut is ${unload.shortcut || "unbound"}`);
      }
      return `shortcut unloaded tab ${shortcutHandle}`;
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
      await driver.execute("document.querySelector('[data-testid=nav-tabs]').click()");
      const visible = await driver.execute("return document.querySelectorAll('[data-testid=tab-list] [role=listitem]').length");
      if (visible >= stressTabs) throw new Error(`All ${visible} rows rendered; list is not virtualized`);
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
      return `${stressTabs} tracked, ${visible} rendered before search, one matching row`;
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

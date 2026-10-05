#!/usr/bin/env node
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { startFixtureServer } from "./lib/fixture-server.mjs";
import { parseArgs, WebDriverSession } from "./lib/webdriver.mjs";

const HELP = `Usage: node scripts/startup-smoke.mjs --browser chrome|brave|firefox-dev [options]
  --binary PATH       Browser executable
  --driver PATH       Matching WebDriver executable
  --extension PATH    Unpacked WXT build folder
  --artifacts PATH    Ignored report directory
  --headed            Show browser windows

Uses one disposable profile across two browser launches. Firefox Developer
Edition installs an unsigned add-on permanently in that isolated profile.
`;

async function request(driver, message) {
  const response = await driver.executeAsync(`
    const [message, done] = arguments;
    if (globalThis.browser?.runtime?.sendMessage) {
      browser.runtime.sendMessage(message).then(done, error => done({ ok: false, error: String(error) }));
    } else {
      chrome.runtime.sendMessage(message, value => done(chrome.runtime.lastError
        ? { ok: false, error: chrome.runtime.lastError.message } : value));
    }
  `, [message]);
  if (!response?.ok) throw new Error(response?.error ?? `Extension request ${message.type} failed`);
  return response.data;
}

async function main() {
  const cli = parseArgs(process.argv.slice(2));
  if (cli.help) { process.stdout.write(HELP); return; }
  const target = cli.browser ?? "chrome";
  if (!["chrome", "brave", "firefox-dev"].includes(target)) throw new Error("Choose chrome, brave, or firefox-dev.");
  const firefox = target === "firefox-dev";
  const browser = firefox ? "firefox" : target;
  const binary = resolve(cli.binary ?? (target === "chrome"
    ? "artifacts/browsers/chrome-for-testing/chrome-linux64/chrome"
    : target === "brave" ? "/usr/bin/brave" : "artifacts/browsers/firefox-devedition/firefox/firefox"));
  const driverBinary = resolve(cli.driver ?? (firefox
    ? "artifacts/drivers/gecko/geckodriver"
    : target === "brave" ? "artifacts/drivers/brave/chromedriver-linux64/chromedriver" : "/usr/bin/chromedriver"));
  const extension = resolve(cli.extension ?? (firefox ? ".output/firefox-mv2" : ".output/chrome-mv3"));
  await access(join(extension, "manifest.json"));
  const artifactDir = resolve(cli.artifacts ?? `test-results/startup-${target}`);
  await mkdir(artifactDir, { recursive: true });
  const profile = await mkdtemp(join(tmpdir(), `unloader-startup-${target}-`));
  const fixture = await startFixtureServer();
  const fixtureUrl = `${fixture.origin}/page/startup`;
  const report = { browser: target, generatedAt: new Date().toISOString(), checks: [], versions: [] };
  let session;

  function createSession(restarted) {
    return new WebDriverSession({
      browser, binary, driver: driverBinary, extension, profile,
      preserveProfile: true, headless: !cli.headed,
      extraArgs: firefox ? [] : ["--restore-last-session"],
      firefoxPrefs: firefox ? {
        "xpinstall.signatures.required": false,
        "browser.startup.page": 3,
        "browser.sessionstore.resume_session_once": true,
      } : {},
      permanentAddon: firefox,
      installAddon: !restarted,
    });
  }

  async function dashboardUrl() {
    const origin = firefox ? await session.firefoxExtensionOrigin()
      : `chrome-extension://${await session.extensionId()}`;
    return `${origin}/dashboard.html`;
  }

  async function openDashboard() {
    await session.newTab(await dashboardUrl());
    await session.waitFor(() => session.execute(
      "return !!document.querySelector('[data-testid=dashboard-app]')",
    ), "dashboard startup");
  }

  async function check(name, run) {
    try {
      const detail = await run();
      report.checks.push({ name, status: "passed", detail });
      process.stdout.write(`PASS ${name} — ${detail}\n`);
    } catch (error) {
      report.checks.push({ name, status: "failed", error: error.message });
      process.stderr.write(`FAIL ${name} — ${error.message}\n`);
    }
  }

  try {
    session = createSession(false);
    await session.start();
    report.versions.push(session.capabilities.browserVersion);
    await check("install and manually unload a Keep awake page", async () => {
      await session.navigate(fixtureUrl);
      await openDashboard();
      await request(session, { type: "setRule", hostname: "127.0.0.1", rule: { mode: "awake" } });
      const before = await request(session, { type: "getSnapshot" });
      const targetTab = before.tabs.find((tab) => tab.url === fixtureUrl);
      if (!targetTab) throw new Error("Startup fixture tab is missing");
      const result = await request(session, { type: "unloadTab", tabId: targetTab.id });
      if (result.status !== "done") throw new Error(`Unload returned ${result.status}: ${result.message}`);
      await session.waitFor(async () => {
        const state = await request(session, { type: "getSnapshot" });
        return state.tabs.find((tab) => tab.url === fixtureUrl)?.discarded;
      }, "discarded startup fixture");
      return "site rule and sleeping tab saved in the isolated profile";
    });
    await session.stop();
    session = createSession(true);
    await session.start();
    report.versions.push(session.capabilities.browserVersion);
    await check("rule and installed extension survive browser restart", async () => {
      await openDashboard();
      const state = await request(session, { type: "getSnapshot" });
      if (state.settings.siteRules["127.0.0.1"]?.mode !== "awake") {
        throw new Error("Keep awake rule did not persist");
      }
      return "dashboard reopened and Keep awake rule persisted";
    });
    await check("existing Keep awake tab wakes at startup", async () => {
      await session.waitFor(async () => {
        const state = await request(session, { type: "getSnapshot" });
        const tab = state.tabs.find((item) => item.url === fixtureUrl);
        return tab && !tab.discarded ? tab : null;
      }, "startup wake of restored tab", 20000);
      return "restored page is loaded after restart";
    });
    if (!firefox) await check("background worker resumes after being stopped", async () => {
      const extensionId = await session.extensionId();
      const { targetInfos } = await session.cdp("Target.getTargets");
      const worker = targetInfos.find((item) => item.type === "service_worker" &&
        item.url.startsWith(`chrome-extension://${extensionId}/`));
      if (!worker) throw new Error("Could not locate the extension service worker target");
      const closed = await session.cdp("Target.closeTarget", { targetId: worker.targetId });
      if (!closed.success) throw new Error("Browser refused to stop the worker");
      const state = await request(session, { type: "getSnapshot" });
      if (state.settings.siteRules["127.0.0.1"]?.mode !== "awake") {
        throw new Error("Policy was lost when the worker restarted");
      }
      return "worker woke on request with the saved rule intact";
    });
  } catch (error) {
    report.fatal = error.message;
    process.stderr.write(`FATAL ${error.message}\n`);
  } finally {
    await session?.stop();
    await fixture.close();
    await rm(profile, { recursive: true, force: true, maxRetries: 3 });
    report.summary = {
      passed: report.checks.filter((item) => item.status === "passed").length,
      failed: report.checks.filter((item) => item.status === "failed").length,
    };
    await writeFile(join(artifactDir, "report.json"), JSON.stringify(report, null, 2) + "\n");
    process.stdout.write(`Report: ${join(artifactDir, "report.json")}\n`);
  }
  if (report.fatal || report.summary.failed) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exitCode = 1;
});

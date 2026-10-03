#!/usr/bin/env node
import { access, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { startFixtureServer } from "./lib/fixture-server.mjs";
import {
  clockTicksPerSecond,
  cpuTicksBetween,
  isFirefox,
  linuxProcessSample,
  parseArgs,
  WebDriverSession,
} from "./lib/webdriver.mjs";

const HELP = `Usage: node scripts/benchmark.mjs [options]

Options:
  --browser chromium|brave|chrome|firefox|zen  Browser (default: chromium)
  --extension PATH                         Unpacked WXT build folder
  --binary PATH                            Browser executable override
  --driver PATH                            Matching WebDriver executable
  --tab-counts 20,100,300                  Number of fixture tabs (default)
  --runs 3                                 Independent paired runs (default)
  --fixture-mb 1                           JavaScript memory per tab (0-16)
  --settle-ms 3000                         Pause before each sample
  --cpu-ms 1500                            CPU observation window
  --output PATH                            BenchmarkReport JSON path
  --headed                                 Show browser windows
  --help                                   Show this help

The benchmark compares fresh isolated browser profiles with identical local
pages. Linux PSS includes the browser process tree, not the WebDriver process.
Each run measures absent, extension idle, dashboard open, automation enabled,
and native-discarded tabs. The importable report follows BenchmarkReport schema 1.
The adjacent .raw.json contains individual samples and failure details.
`;

const pause = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
const median = (values) => {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

async function send(driver, message) {
  const response = await driver.executeAsync(`
    const message = arguments[0];
    const done = arguments[arguments.length - 1];
    try {
      if (globalThis.browser?.runtime?.sendMessage) {
        browser.runtime.sendMessage(message).then(done, (error) => done({ ok: false, error: String(error) }));
      } else {
        chrome.runtime.sendMessage(message, (value) => {
          const error = chrome.runtime.lastError;
          done(error ? { ok: false, error: error.message } : value);
        });
      }
    } catch (error) { done({ ok: false, error: String(error) }); }
  `, [message]);
  if (!response?.ok) throw new Error(response?.error ?? `${message.type} failed`);
  return response.data;
}

async function openFixtureTabs(driver, origin, count, fixtureMb) {
  const url = (index) => `${origin}/page/${index}?mb=${fixtureMb}`;
  await driver.navigate(url(0));
  for (let index = 1; index < count; index += 1) {
    if (isFirefox(driver.browser)) {
      await driver.newTab(url(index));
    } else {
      await driver.cdp("Target.createTarget", { url: url(index) });
    }
  }
  if (!isFirefox(driver.browser)) {
    await driver.waitFor(async () => {
      const { targetInfos } = await driver.cdp("Target.getTargets");
      return targetInfos.filter((target) => target.type === "page" && target.url.startsWith(`${origin}/page/`)).length >= count;
    }, `${count} page targets`, 90000);
  }
  // Target creation alone does not prove a background page ran its memory
  // fixture. Visit each target in both baseline and extension profiles.
  let ready = 0;
  for (const handle of await driver.getWindowHandles()) {
    await driver.switchWindow(handle);
    const currentUrl = await driver.command("GET", "/url");
    if (!currentUrl.startsWith(`${origin}/page/`)) continue;
    await driver.waitFor(() => driver.execute(
      "return window.__fixtureReady === true && (arguments[0] === 0 || window.__memoryFixture?.length === arguments[0] * 1048576)",
      [fixtureMb],
    ), `fixture ready in ${currentUrl}`, 30000);
    ready += 1;
  }
  if (ready !== count) throw new Error(`Only ${ready} of ${count} fixture pages finished loading`);
}

async function sample(driver, settleMs, cpuMs, ticksPerSecond) {
  await pause(settleMs);
  const before = await linuxProcessSample(driver.driverProcess.pid);
  await pause(cpuMs);
  const after = await linuxProcessSample(driver.driverProcess.pid);
  const elapsedSeconds = (after.measuredAt - before.measuredAt) / 1000;
  // Browser child processes can exit between reads. Subtracting two process
  // tree totals would then produce a nonsensical negative CPU percentage.
  const cpuDeltaTicks = cpuTicksBetween(before.cpuByPid, after.cpuByPid);
  return {
    pssKiB: after.pssKiB,
    processes: after.processes,
    cpuPercent: Number(((cpuDeltaTicks / ticksPerSecond / elapsedSeconds) * 100).toFixed(2)),
  };
}

async function runBaseline(options, origin, count, ticksPerSecond) {
  const driver = new WebDriverSession({
    browser: options.browser,
    binary: options.binary,
    driver: options.driver,
    headless: !options.headed,
  });
  try {
    await driver.start();
    await openFixtureTabs(driver, origin, count, options.fixtureMb);
    await driver.newTab("about:blank");
    const value = await sample(driver, options.settleMs, options.cpuMs, ticksPerSecond);
    return { ...value, browserVersion: driver.capabilities.browserVersion };
  } finally {
    await driver.stop();
  }
}

async function runExtension(options, origin, count, ticksPerSecond) {
  const driver = new WebDriverSession({
    browser: options.browser,
    binary: options.binary,
    driver: options.driver,
    extension: options.extension,
    headless: !options.headed,
  });
  try {
    await driver.start();
    await openFixtureTabs(driver, origin, count, options.fixtureMb);
    const neutralHandle = await driver.newTab("about:blank");
    const idle = await sample(driver, options.settleMs, options.cpuMs, ticksPerSecond);
    const extensionOrigin = isFirefox(options.browser)
      ? await driver.firefoxExtensionOrigin()
      : `chrome-extension://${await driver.extensionId()}`;
    await driver.newTab(`${extensionOrigin}/dashboard.html`);
    await driver.waitFor(() => driver.execute(
      "return !!document.querySelector('[data-testid=dashboard-app]')",
    ), "dashboard app", 30000);
    const dashboard = await sample(driver, options.settleMs, options.cpuMs, ticksPerSecond);

    // Keep automation enabled while every fixture stays loaded. A one-minute
    // timer can expire during the 300-tab setup and contaminate the comparison.
    await send(driver, { type: "setGlobalMinutes", minutes: 15 });
    await driver.command("DELETE", "/window");
    await driver.switchWindow(neutralHandle);
    const automatic = await sample(driver, options.settleMs, options.cpuMs, ticksPerSecond);

    await driver.newTab(`${extensionOrigin}/dashboard.html`);
    const snapshot = await send(driver, { type: "getSnapshot" });
    const targets = snapshot.tabs.filter((tab) => tab.url.startsWith(`${origin}/page/`));
    if (targets.length !== count) {
      throw new Error(`Expected ${count} extension tab records; got ${targets.length}`);
    }
    let discarded = 0;
    for (const target of targets) {
      if (target.discarded) {
        discarded += 1;
        continue;
      }
      const result = await send(driver, { type: "unloadTab", tabId: target.id });
      if (result.status === "done") discarded += 1;
    }
    if (discarded < count - 1) {
      throw new Error(`Only ${discarded} of ${count} fixture tabs could be unloaded`);
    }
    await driver.command("DELETE", "/window");
    await driver.switchWindow(neutralHandle);
    const unloaded = await sample(driver, options.settleMs, options.cpuMs, ticksPerSecond);
    return {
      idle, dashboard, automatic, unloaded,
      discarded,
      browserVersion: driver.capabilities.browserVersion,
    };
  } finally {
    await driver.stop();
  }
}

async function main() {
  const cli = parseArgs(process.argv.slice(2));
  if (cli.help) {
    process.stdout.write(HELP);
    return;
  }
  if (process.platform !== "linux") throw new Error("Linux /proc PSS is required for this benchmark.");
  const browser = cli.browser ?? "chromium";
  const extension = resolve(cli.extension ?? (isFirefox(browser) ? ".output/firefox-mv2" : ".output/chrome-mv3"));
  await access(resolve(extension, "manifest.json"));
  const counts = (cli["tab-counts"] ?? "20,100,300").split(",").map(Number);
  const runs = Number(cli.runs ?? 3);
  const fixtureMb = Number(cli["fixture-mb"] ?? 1);
  const settleMs = Number(cli["settle-ms"] ?? 3000);
  const cpuMs = Number(cli["cpu-ms"] ?? 1500);
  if (counts.some((value) => !Number.isInteger(value) || value < 1 || value > 300) ||
      !Number.isInteger(runs) || runs < 1 || runs > 20 ||
      !Number.isFinite(fixtureMb) || fixtureMb < 0 || fixtureMb > 16 ||
      !Number.isFinite(settleMs) || settleMs < 0 ||
      !Number.isFinite(cpuMs) || cpuMs < 100) {
    throw new Error("Invalid tab counts, run count, fixture size, or sampling window.");
  }
  const output = resolve(cli.output ?? `test-results/benchmarks/${browser}.json`);
  await mkdir(resolve(output, ".."), { recursive: true });
  const options = {
    browser,
    binary: cli.binary,
    driver: cli.driver,
    extension,
    headed: cli.headed,
    fixtureMb,
    settleMs,
    cpuMs,
  };
  const ticksPerSecond = clockTicksPerSecond();
  const fixture = await startFixtureServer();
  const raw = {
    browser,
    generatedAt: new Date().toISOString(),
    method: "Linux process-tree PSS from /proc/*/smaps_rollup; CPU from /proc/*/stat",
    note: "Every fixture page is verified loaded before sampling; a neutral blank tab stays active in baseline, idle, automatic, and unloaded conditions. CPU windows are noisy and omit processes that ended during the sample. Use medians of repeated paired runs. Automation uses a 15-minute timer so fixtures remain loaded before explicit discards. Unloading savings compare automation-enabled PSS before and after discarding in the same profile; negative savings mean measured resident PSS was higher afterward, often because processes or caches remain. Savings are separate from extension overhead versus the no-extension baseline.",
    fixtureMb,
    settleMs,
    cpuMs,
    counts,
    requestedRuns: runs,
    samples: [],
  };
  try {
    for (const count of counts) {
      for (let run = 1; run <= runs; run += 1) {
        process.stdout.write(`Measuring ${browser}, ${count} tabs, run ${run}/${runs}: baseline\n`);
        const baseline = await runBaseline(options, fixture.origin, count, ticksPerSecond);
        process.stdout.write(`Measuring ${browser}, ${count} tabs, run ${run}/${runs}: extension\n`);
        const extensionResult = await runExtension(options, fixture.origin, count, ticksPerSecond);
        raw.samples.push({
          tabs: count,
          run,
          baseline,
          extension: extensionResult,
          unloadingSavingsKiB: extensionResult.automatic.pssKiB - extensionResult.unloaded.pssKiB,
        });
        process.stdout.write(`  PSS KiB: ${baseline.pssKiB} baseline; ${extensionResult.idle.pssKiB} idle; ${extensionResult.unloaded.pssKiB} unloaded\n`);
      }
    }
  } catch (error) {
    raw.failure = error.stack ?? String(error);
    throw error;
  } finally {
    await fixture.close();
    raw.unloadingSavingsByTabs = counts.map((tabs) => {
      const measured = raw.samples.filter((item) => item.tabs === tabs);
      return {
        tabs,
        runs: measured.length,
        medianKiB: measured.length ? median(measured.map((item) => item.unloadingSavingsKiB)) : null,
      };
    });
    await writeFile(output.replace(/\.json$/, ".raw.json"), JSON.stringify(raw, null, 2) + "\n");
  }
  const series = [];
  for (const tabs of counts) {
    const samples = raw.samples.filter((item) => item.tabs === tabs);
    for (const condition of ["idle", "dashboard", "automatic", "unloaded"]) {
      series.push({
        tabs,
        condition,
        baselineMedianPssKiB: median(samples.map((item) => item.baseline.pssKiB)),
        extensionMedianPssKiB: median(samples.map((item) => item.extension[condition].pssKiB)),
        deltaMedianPssKiB: median(samples.map((item) =>
          item.extension[condition].pssKiB - item.baseline.pssKiB)),
        runs: samples.length,
        cpuPercent: median(samples.map((item) => item.extension[condition].cpuPercent)),
      });
    }
  }
  const report = {
    schema: 1,
    generatedAt: new Date().toISOString(),
    browser: ({ chrome: "Chrome for Testing", brave: "Brave (Chromium)", firefox: "Firefox", zen: "Zen (Firefox engine)", chromium: "Chromium" }[browser] ?? browser) +
      ` ${raw.samples[0]?.extension.browserVersion ?? ""}`.trimEnd(),
    platform: `${process.platform} ${process.arch}`,
    series,
  };
  await writeFile(output, JSON.stringify(report, null, 2) + "\n");
  process.stdout.write(`Importable report: ${output}\nRaw paired samples: ${output.replace(/\.json$/, ".raw.json")}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exitCode = 1;
});

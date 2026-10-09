#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs, WebDriverSession } from "./lib/webdriver.mjs";

const options = parseArgs(process.argv.slice(2));
const preview = options.preview || "http://127.0.0.1:4319";
const website = options.website || "http://127.0.0.1:4320";
const artifacts = resolve(options.artifacts || "test-results/visual");
await mkdir(artifacts, { recursive: true });

// Independent builds carry the same tokens, with no cross-project build dependency.
const extensionTokens = await readFile("src/ui/theme.css", "utf8");
const websiteTokens = await readFile("../next/app/theme.css", "utf8");
if (extensionTokens !== websiteTokens) throw new Error("Website and extension theme tokens differ");

const driver = new WebDriverSession({
  browser: "chromium", binary: options.binary, driver: options.driver,
  headless: true, artifactDir: artifacts,
});
const results = [];
const failures = [];

async function verify(name, surfaces) {
  await driver.executeAsync("const done = arguments[arguments.length - 1]; document.fonts.ready.then(() => requestAnimationFrame(() => requestAnimationFrame(done)));");
  const state = await driver.execute(`
    function background(el) {
      if (!el) return null;
      const color = getComputedStyle(el).backgroundColor;
      return color === 'rgba(0, 0, 0, 0)' || color === 'transparent' ? background(el.parentElement) : color;
    }
    const page = background(document.body);
    return {
      theme: document.documentElement.dataset.theme,
      page,
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
      surfaces: [...document.querySelectorAll(arguments[0])].map(el => ({
        name: el.className, color: background(el),
        image: getComputedStyle(el).backgroundImage,
      })),
    };
  `, [surfaces]);
  if (state.overflow) failures.push(name + ": horizontal overflow");
  const mixed = state.surfaces.filter(el => el.color !== state.page || el.image !== "none");
  if (mixed.length) failures.push(name + ": inconsistent surfaces " + JSON.stringify(mixed));
  await driver.screenshot(resolve(artifacts, name + ".png"));
  results.push({ name, ...state });
  process.stdout.write("Checked " + name + "\n");
}

try {
  await driver.start();
  for (const width of [1280, 390]) {
    await driver.cdp("Emulation.setDeviceMetricsOverride", {
      width, height: width === 1280 ? 800 : 844, deviceScaleFactor: 1, mobile: width === 390,
    });
    for (const theme of ["light", "dark"]) {
      for (const section of ["tabs", "rules", "activity", "settings"]) {
        await driver.navigate(preview + "/dashboard.html?theme=" + theme + "#" + section);
        await driver.waitFor(() => driver.execute("return !!document.querySelector('[data-testid=dashboard-app]') && document.documentElement.dataset.theme === arguments[0]", [theme]), "dashboard theme");
        await verify("extension-" + section + "-" + theme + "-" + width, ".app-header,.panel,.memory-overview,.table-heading,.window-row,.tab-row,.feature-card,.timer-controls,.shortcut-display");
      }
      await driver.navigate(preview + "/popup.html?theme=" + theme);
      await driver.waitFor(() => driver.execute("return !!document.querySelector('[data-testid=popup-app]') && document.documentElement.dataset.theme === arguments[0]", [theme]), "popup theme");
      // A browser popup has its own fixed width, rather than a full responsive page.
      await driver.cdp("Emulation.setDeviceMetricsOverride", { width: 350, height: 480, deviceScaleFactor: 1, mobile: false });
      await verify("extension-popup-" + theme + "-" + width, ".popup,.popup-memory,.popup-metrics");
      await driver.cdp("Emulation.setDeviceMetricsOverride", { width, height: width === 1280 ? 800 : 844, deviceScaleFactor: 1, mobile: width === 390 });

      await driver.navigate(website);
      await driver.waitFor(() => driver.execute("return !!document.querySelector('select[aria-label=\"Color theme\"]')"), "website theme selector");
      await driver.execute(`
        const select = document.querySelector('select[aria-label="Color theme"]');
        Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, arguments[0]);
        select.dispatchEvent(new Event('change', { bubbles: true }));
      `, [theme]);
      await driver.waitFor(() => driver.execute("return document.documentElement.dataset.theme === arguments[0] && localStorage.getItem('unloader-website-theme') === arguments[0]", [theme]), "website selected theme");
      for (const route of ["/", "/docs", "/download", "/privacy"]) {
        await driver.navigate(website + route);
        await driver.waitFor(() => driver.execute("return document.documentElement.dataset.theme === arguments[0]", [theme]), "persisted website theme");
        await verify("website-" + (route.slice(1) || "home") + "-" + theme + "-" + width, ".nav,.browser-demo,.demo-toolbar,.demo-body,.intro,.features,.closing,.download-grid,.download-grid article,.prose,footer");
      }
    }
  }
  // System follows the OS until an explicit preference overrides it.
  await driver.navigate(website);
  await driver.execute("localStorage.setItem('unloader-website-theme','system'); window.dispatchEvent(new StorageEvent('storage',{key:'unloader-website-theme'}));");
  for (const system of ["dark", "light"]) {
    await driver.cdp("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: system }] });
    await driver.waitFor(() => driver.execute("return document.documentElement.dataset.theme === arguments[0]", [system]), "system " + system + " theme");
  }
  await driver.execute("localStorage.setItem('unloader-website-theme','light'); window.dispatchEvent(new StorageEvent('storage',{key:'unloader-website-theme'}));");
  await driver.cdp("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "dark" }] });
  await driver.waitFor(() => driver.execute("return document.documentElement.dataset.theme === 'light'"), "explicit preference overrides OS");
  if (failures.length) throw new Error(failures.join("\n"));
  process.stdout.write("PASS unified themes, all routes, desktop/mobile layouts, persistence, and system preference\n");
} finally {
  await writeFile(resolve(artifacts, "report.json"), JSON.stringify({ results, failures }, null, 2));
  await driver.stop();
}

#!/usr/bin/env node
import { access, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { isFirefox, parseArgs, WebDriverSession } from "./lib/webdriver.mjs";

const HELP = `Usage: node scripts/open-preview.mjs --browser chrome|brave|firefox|firefox-dev|zen [options]
  --binary PATH    Override the browser executable
  --driver PATH    Override the matching WebDriver executable
  --profile PATH   Use a dedicated test profile (default: test-results/manual-profiles/BROWSER)

Opens a visible browser with Unloader installed and its dashboard ready.
The profile stays on disk; Ctrl+C closes this preview. Your normal browser
profiles are never touched. Firefox and Zen use temporary add-ons that are
installed again on each preview launch. Firefox Developer Edition keeps its
unsigned add-on in the dedicated profile between launches.
`;

const TARGETS = {
  chrome: {
    browser: "chrome",
    binary: "artifacts/browsers/chrome-for-testing/chrome-linux64/chrome",
    driver: "/usr/bin/chromedriver",
  },
  brave: {
    browser: "brave",
    binary: "/usr/bin/brave",
    driver: "artifacts/drivers/brave/chromedriver-linux64/chromedriver",
  },
  firefox: {
    browser: "firefox",
    binary: "/usr/bin/firefox",
    driver: "artifacts/drivers/gecko/geckodriver",
  },
  "firefox-dev": {
    browser: "firefox",
    binary: "artifacts/browsers/firefox-devedition/firefox/firefox",
    driver: "artifacts/drivers/gecko/geckodriver",
    permanentAddon: true,
  },
  zen: {
    browser: "zen",
    binary: "artifacts/drivers/zen/firefox",
    driver: "artifacts/drivers/gecko/geckodriver",
  },
};

async function main() {
  const cli = parseArgs(process.argv.slice(2));
  if (cli.help) { process.stdout.write(HELP); return; }
  const target = cli.browser ?? "chrome";
  const config = TARGETS[target];
  if (!config) throw new Error(`Unknown browser: ${target}. Use --help for choices.`);

  const firefox = isFirefox(config.browser);
  const extension = resolve(firefox ? ".output/firefox-mv2" : ".output/chrome-mv3");
  const profile = resolve(cli.profile ?? `test-results/manual-profiles/${target}`);
  await access(join(extension, "manifest.json"));
  await mkdir(profile, { recursive: true });

  const session = new WebDriverSession({
    browser: config.browser,
    binary: resolve(cli.binary ?? config.binary),
    driver: resolve(cli.driver ?? config.driver),
    extension,
    profile,
    preserveProfile: true,
    headless: false,
    permanentAddon: !!config.permanentAddon,
    firefoxPrefs: config.permanentAddon ? { "xpinstall.signatures.required": false } : {},
  });

  let closed = false;
  const close = () => { closed = true; };
  process.on("SIGINT", close);
  process.on("SIGTERM", close);
  try {
    await session.start();
    const origin = firefox ? await session.firefoxExtensionOrigin()
      : `chrome-extension://${await session.extensionId()}`;
    await session.newTab(`${origin}/dashboard.html`);
    await session.waitFor(() => session.execute(
      "return !!document.querySelector('[data-testid=dashboard-app]')",
    ), "Unloader dashboard", 30000);
    process.stdout.write(`Unloader is ready in ${target}.\nProfile: ${profile}\nClose this window or press Ctrl+C to end the preview.\n`);
    while (!closed) {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 2000));
      try {
        if ((await session.getWindowHandles()).length === 0) break;
      } catch {
        break;
      }
    }
  } finally {
    await session.stop();
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exitCode = 1;
});

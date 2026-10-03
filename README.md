# Unloader

Unloader keeps idle pages in your browser's tab bar while asking the browser to discard their page content. It starts in **manual mode**: choose a tab in the dashboard or use the browser shortcut to unload it. The page reloads when you return. You can opt into a global idle timer and give each website its own rule. Set `web.whatsapp.com` to **Keep awake** if you want WhatsApp ready when the browser starts.

Unloader is built for desktop Chrome/Brave and Firefox/Zen. It stores settings, recent activity, and focused-tab sorting data in the local browser profile. No account or server is involved.

## Build and load locally

```bash
npm ci
npm run typecheck
npm test
npm run build:chrome
npm run build:firefox
```

The project installs a local Node 24 runtime as a development dependency for WXT. Load `.output/chrome-mv3` from **Load unpacked** on `chrome://extensions` or `brave://extensions` with Developer mode enabled. For Firefox or Zen, use **Load Temporary Add-on** in `about:debugging#/runtime/this-firefox` and select `.output/firefox-mv2/manifest.json`. Temporary Firefox add-ons are removed when the browser restarts; persistent development testing requires Firefox Developer Edition or a signed release.

Click the toolbar icon to open the dashboard. The **Tabs** page searches and groups open tabs by window. **Website rules** controls global and per-hostname timers. **Page usage** sorts by recent focused use; it deliberately hides time totals. **Extension statistics** shows local storage and scheduler work, and can import a local benchmark report. **Activity** keeps the latest 100 events. **Settings** exports or imports your rules and appearance.

The suggested quick-unload shortcut is **Ctrl+Shift+U** (Command+Shift+U on macOS). Some browsers or operating systems may reserve a key combination. The Settings page shows the shortcut that actually registered and points to the browser's extension-shortcut page if you need to assign another one. The dashboard's Unload button always remains available.

## Measure and test

```bash
npm run test:browser -- --browser chromium
npm run test:startup -- --browser chrome
npm run benchmark -- --browser chromium --tab-counts 20,100,300 --runs 3
```

The browser scripts use disposable profiles and local fixture pages; use `--help` for browser binary, WebDriver, headed mode, and output options. The restart test supports `chrome`, `brave`, and `firefox-dev`; Firefox Developer Edition is needed for an unsigned add-on to persist across restarts. Reports and screenshots are written under ignored `test-results/`. Benchmarks compare Linux browser-process PSS and CPU across paired profiles. They are environment-specific measurements, not an exact live extension RAM meter or a promise of immediate memory savings. Full per-page RAM is unavailable to a standard cross-browser extension; use Chrome/Brave Task Manager (`Shift+Esc`) or Firefox/Zen `about:processes` for browser-native inspection.

The detailed product decisions, test matrix, sources, and local verification record live in the intentionally Git-ignored `docs.md`.

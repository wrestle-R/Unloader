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

To try Unloader without changing your usual browser profiles, launch a visible test window from the project folder:

```bash
npm run preview -- --browser chrome
# Choose brave, firefox, zen, or firefox-dev instead of chrome as needed.
```

The launcher installs the matching local build, opens the dashboard, and saves the dedicated profile under ignored `test-results/manual-profiles/`. Keep its terminal open while testing; closing the test window or pressing Ctrl+C ends the preview. Chrome for Testing and Brave load the unpacked build on each preview launch. Firefox and Zen load the unsigned add-on again each time; `firefox-dev` uses a persistent unsigned add-on in its dedicated profile.

Click the toolbar icon, then **Manage tabs** to open the dashboard. The **Tabs** page searches, filters loaded or unloaded pages, and groups open tabs by window. Protected pages show why automatic unloading skips them. Browser and extension pages are excluded. Choose **System**, **Light**, or **Dark** in the header or Settings. **Website rules** controls global and per-hostname timers. **Activity** keeps the latest 100 events. **Settings** exports or imports your rules and appearance.

The suggested quick-unload shortcut is **Ctrl+Shift+U** (Command+Shift+U on macOS). Some browsers or operating systems may reserve a key combination. The Settings page shows the shortcut that actually registered and points to the browser's extension-shortcut page if you need to assign another one. The dashboard's Unload button always remains available.

## Measure and test

```bash
npm run test:browser -- --browser chromium
npm run test:startup -- --browser chrome
```

The browser scripts use disposable profiles and local fixture pages; use `--help` for browser binary, WebDriver, headed mode, and output options. The restart test supports `chrome`, `brave`, and `firefox-dev`; Firefox Developer Edition is needed for an unsigned add-on to persist across restarts. Reports and screenshots are written under ignored `test-results/`.

The detailed product decisions, test matrix, sources, and local verification record live in the intentionally Git-ignored `docs.md`.

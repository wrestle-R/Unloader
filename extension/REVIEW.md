# Mozilla review build instructions

Unloader 0.2.0 is built from TypeScript and React with WXT/Vite. No remote code or external runtime service is used.

1. Install Node.js 24.15 or newer and npm.
2. Extract this source archive and open a terminal in its root.
3. Run `npm ci`.
4. Run `npm run build:firefox`.
5. The installable extension files are in `.output/firefox-mv2/`. The generated `manifest.json` belongs at the ZIP root.

The lockfile pins dependencies. The package includes a local Node 24 runtime for WXT. The two bundled WOFF2 fonts are in `src/ui/assets`; their licenses are included there. Icons are project assets in `public/icon`.

Permissions: tabs displays/discards/restores tabs; storage persists settings/activity/usage locally; alarms schedules idle checks; idle distinguishes locked devices; HTTP(S) content access observes editing/media safety signals. No browsing data is transmitted. Content scripts send safety booleans, not form values, to the local background script.

Fresh installs enable a 15-minute timer. Existing settings are retained. Automatic unloading protects active, pinned, audible, editing, media and loading tabs, and skips private/browser pages. Manual actions may require confirmation.

Disposable browser profiles, development binaries, test artifacts and the separate documentation website are deliberately excluded from this source archive.

# Unloader

A local-first tab unloader for desktop Zen, Firefox, Chrome and Brave. Fresh installs automatically unload eligible background tabs after 15 minutes. Tabs stay in the tab bar and reload when selected. Existing saved settings are preserved.

## Repository layout

```text
Unloader/
├── next/        # Next.js website, public documentation and downloads
├── extension/   # WXT browser extension, source, scripts and tests
└── docs/        # Local project notes; ignored by Git
```

The Git repository stays at this root. Each application has its own package.json and lockfile. Run its commands from the corresponding folder.

## Website

```bash
cd next
npm ci
npm run dev
```

Run `npm run build` for a production build. On Vercel, import this repository, choose **Next.js**, and set **Root Directory** to `next`.

See [website setup](next/README.md) for Mozilla listing and signed-download configuration.

## Extension

```bash
cd extension
npm ci
npm run typecheck
npm test
npm run build:firefox
npm run build:chrome
```

Use Node.js 24.15 or newer for extension development. Builds are generated under `extension/.output/`. See [extension documentation](extension/README.md) for local installation, browser previews, shortcuts and smoke tests, and [Mozilla review instructions](extension/REVIEW.md) for reproducible builds.

## Downloads

[GitHub Releases](https://github.com/wrestle-R/Unloader/releases) contains the Chromium and temporary Firefox development ZIPs. Permanent Firefox/Zen installation requires a Mozilla-signed package. The version 0.2.0 Mozilla submission was awaiting review at submission; its reserved [listing](https://addons.mozilla.org/en-US/firefox/addon/unloader/) becomes available after publication.

## Local notes

Keep internal documentation and verification records in `docs/`. This folder is intentionally ignored by Git. Public user documentation belongs in the Next.js website.

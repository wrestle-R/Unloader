# Unloader website

Next.js App Router website with documentation, privacy policy, Firefox Add-ons installation and GitHub Release downloads.

```sh
npm ci
npm run dev
npm run build
```

This website lives in `next/` at the Unloader repository root, alongside `extension/` and the Git-ignored `docs/` folder. Import `wrestle-R/Unloader` into Vercel, choose the Next.js preset, and set Root Directory to `next`. You can also deploy directly from this folder with Vercel CLI. No environment variables are required for the initial site.

Unloader is published on Firefox Add-ons: https://addons.mozilla.org/en-US/firefox/addon/unloader/ . Firefox and Zen installation links use this listing by default, with no environment configuration required.

Set `NEXT_PUBLIC_AMO_URL` to override the Mozilla listing URL, then redeploy.

Chrome and Brave use the same Chromium ZIP from the latest GitHub release. Install it through Load unpacked.

The header theme selector applies Light, Dark or System across every route and persists the preference locally. Keep the theme tokens in `app/theme.css` and `extension/src/ui/theme.css` identical so either app can build independently.

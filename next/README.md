# Unloader website

Next.js App Router website with documentation, privacy policy, Firefox Add-ons installation and GitHub Release downloads.

```sh
npm ci
npm run dev
npm run build
```

This website lives in `next/` at the Unloader repository root, alongside `extension/` and the Git-ignored `docs/` folder. Import `wrestle-R/Unloader` into Vercel, choose the Next.js preset, and set Root Directory to `next`. You can also deploy directly from this folder with Vercel CLI. No environment variables are required for the initial site.

Unloader is published on Firefox Add-ons: https://addons.mozilla.org/en-US/firefox/addon/unloader/ . Firefox and Zen installation links use this listing by default, with no environment configuration required.

Optionally set `NEXT_PUBLIC_AMO_URL` to override the public listing URL. After uploading Mozilla's signed XPI to GitHub Releases, set `NEXT_PUBLIC_SIGNED_XPI_URL` to its release download URL to expose an additional signed download link. Redeploy after changing environment variables. Do not point the signed download setting at an unsigned package.

The ZIP download links use stable filenames on the latest GitHub release. `unloader-firefox-unsigned.zip` is explicitly for temporary development use; `unloader-chromium.zip` supports Load unpacked installation.

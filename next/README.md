# Unloader website

Next.js App Router website with documentation, privacy policy and GitHub Release downloads.

```sh
npm ci
npm run dev
npm run build
```

This website lives in `next/` at the Unloader repository root, alongside `extension/` and the Git-ignored `docs/` folder. Import `wrestle-R/Unloader` into Vercel, choose the Next.js preset, and set Root Directory to `next`. You can also deploy directly from this folder with Vercel CLI. No environment variables are required for the initial site.

Mozilla submission for version 0.2.0 is complete and awaiting publication. Reserved listing: https://addons.mozilla.org/en-US/firefox/addon/unloader/ .

After Mozilla publication set `NEXT_PUBLIC_AMO_URL` to the actual public listing URL. After uploading Mozilla's signed XPI to GitHub Releases set `NEXT_PUBLIC_SIGNED_XPI_URL` to its release download URL. Redeploy to expose these install links. Do not point the signed download setting at an unsigned package.

The ZIP download links use stable filenames on the latest GitHub release. `unloader-firefox-unsigned.zip` is explicitly for temporary development use; `unloader-chromium.zip` supports Load unpacked installation.

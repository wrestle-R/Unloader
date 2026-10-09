# README previews

These images render the built extension directly with illustrative data. No presentation frame or alternate color palette is added. No real browsing history or profile is used.

From `extension/`, build and serve the preview renderer:

```bash
npm run build:firefox
node scripts/preview-server.mjs
```

Capture a 1280 × 800 browser viewport after fonts and the app finish loading:

- Light dashboard: `http://127.0.0.1:4319/`
- Dark dashboard: `http://127.0.0.1:4319/?theme=dark`
- Website rules: `http://127.0.0.1:4319/?theme=light&section=rules`

Save the PNGs here as `light.png`, `dark.png` and `rules.png`. This renderer is for screenshots only; its browser API responses are demo fixtures.

The shared visual check also checks all four website routes and both themes. Start the preview server and the website, then run:

```bash
node scripts/visual-check.mjs --website http://127.0.0.1:4320
```

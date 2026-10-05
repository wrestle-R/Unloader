# README previews

These images render the real built extension UI with illustrative tab and website-rule data. The surrounding frame is presentation styling, not part of the extension. No real browsing history or profile is used.

From `extension/`, build and serve the preview renderer:

```bash
npm run build:firefox
node scripts/preview-server.mjs
```

Capture a 1600 × 1280 browser viewport after fonts and the iframe finish loading:

- Light dashboard: `http://127.0.0.1:4319/`
- Dark dashboard: `http://127.0.0.1:4319/?theme=dark`
- Website rules: `http://127.0.0.1:4319/?theme=light&section=rules`

Save the PNGs here as `light.png`, `dark.png` and `rules.png`. This renderer is for screenshots only; its browser API responses are demo fixtures.

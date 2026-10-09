# Site memory estimate catalog

`site-memory-estimates.json` is the editable catalog used by the dashboard. It contains representative planning estimates, not live measurements. Browser extensions cannot reliably read per-tab RAM.

Each entry has:

- `domain`: lowercase hostname used for matching
- `name`: human-readable service name
- `category`: broad product category
- `estimatedMiB`: representative loaded-page memory in mebibytes
- `confidence`: `medium` for manually reviewed high-use apps or `low` for category-derived estimates

Matching checks the exact hostname first and then walks toward its parent domain. Unknown hosts use `fallbackEstimatedMiB`. Increment `version` whenever estimates or matching coverage materially change. Keep domains unique and values positive. Historical unload events retain the estimate captured when they occurred.

The initial broad set combines common web-app overrides with ranked public domains. Update estimates conservatively using repeated fresh-profile browser task-manager samples across representative pages; document the date in `updatedAt`.

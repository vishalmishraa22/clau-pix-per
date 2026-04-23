# report.json Schema

Written by `diff.mjs` per iteration to `.pixel-perfect/runs/<run_id>/report.json`.

| Field | Type | Notes |
|---|---|---|
| `run_id` | string | Folder name, e.g. `2026-04-23T14-22-05-login-card`. |
| `iteration` | number | 1..5. |
| `frame.figma_url` | string \| null | Source Figma frame URL. |
| `frame.name` | string | Frame name from Figma. |
| `frame.width` / `height` | number | Figma frame dimensions. |
| `capture.impl_url` | string | URL Playwright hit. |
| `capture.selector` | string \| null | CSS selector, null = full viewport. |
| `capture.viewport.width` / `height` | number | Playwright viewport. |
| `result.mismatch_pct` | number | 0-100, 3 decimal places. |
| `result.mismatched_pixels` | number | Raw count (post-mask). |
| `result.total_pixels` | number | width times height (post-normalization). |
| `result.passed` | bool | `mismatch_pct < 2.0`. |
| `result.text_color_deltaE_max` | number \| null | Max delta-E 2000 across text regions. |
| `masks_applied` | string[] \| number | List of mask sources OR count. |
| `regions_of_concern` | object[] | `[{bbox: [x,y,w,h], mismatch_pct, note}]`. |
| `artifacts.design` / `impl` / `diff` | string | Absolute paths. |
| `duration_ms` | number | Total diff duration. |

## Reading in code

```javascript
import { readFile } from 'node:fs/promises';
const report = JSON.parse(await readFile('.pixel-perfect/runs/.../report.json', 'utf8'));
if (report.result.passed) { /* ... */ }
```

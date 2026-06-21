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
| `thresholds.max_mismatch_pct` | number | Pass ceiling for `mismatch_pct` (default 2.0). |
| `thresholds.max_masked_pct` | number | Masked-area guardrail cap (default 15.0). |
| `result.mismatch_pct` | number | 0-100, 3 dp. Full-frame basis: `mismatched / total`. Masked pixels inflate the denominator, so this number alone can be gamed by over-masking — always read it alongside `masked_pct` and `mismatch_pct_unmasked_basis`. |
| `result.mismatch_pct_unmasked_basis` | number | 0-100, 3 dp. Honest density: `mismatched / (total − masked)`. Over-masking cannot deflate this. |
| `result.mismatched_pixels` | number | Raw count (post-mask). |
| `result.total_pixels` | number | width times height (post-normalization), full frame. |
| `result.masked_pixels` | number | Distinct pixels covered by the union of all masks (overlaps counted once). |
| `result.masked_pct` | number | 0-100, 3 dp. `masked_pixels / total_pixels`. Surfaced every iteration. |
| `result.visible_pixels` | number | `total_pixels − masked_pixels` (the area actually compared). |
| `result.passed` | bool | `mismatch_pct < max_mismatch_pct` **AND** `masked_pct < max_masked_pct`. Both required. |
| `result.warning` | string \| absent | `"excessive_masking"` when `masked_pct` exceeds the cap. Forces `passed:false`. |
| `result.warning_detail` | string \| absent | Human-readable explanation of the masking warning. |
| `result.text_color_deltaE_max` | number \| null | Max delta-E 2000 across text regions. |
| `masks` | object[] | Per-mask provenance: `[{bbox:[x,y,w,h], pixels, source, selector?, note?}]`. `source` ∈ `selector` / `scrollbar` / `caret` / `manual`. |
| `masks_applied` | number | Count of mask rectangles applied (see `masks` for itemization). |
| `regions_of_concern` | object[] | `[{bbox: [x,y,w,h], mismatch_pct, note}]`. |
| `artifacts.design` / `impl` / `diff` | string | Absolute paths. |
| `duration_ms` | number | Total diff duration. |

## Pass criteria (both must hold)

A run **passes** only when:

1. `result.mismatch_pct < thresholds.max_mismatch_pct` (default 2.0%), AND
2. `result.masked_pct < thresholds.max_masked_pct` (default 15.0%).

If masking exceeds the cap, `passed` is forced to `false` and `result.warning = "excessive_masking"` is set regardless of how low `mismatch_pct` is. This prevents "passing" by masking out large static regions. When triaging a pass, also sanity-check `mismatch_pct_unmasked_basis`: if it is high while `mismatch_pct` is low, the visible area is still wrong and masks are carrying the result.

## Reading in code

```javascript
import { readFile } from 'node:fs/promises';
const report = JSON.parse(await readFile('.pixel-perfect/runs/.../report.json', 'utf8'));
if (report.result.passed) { /* ... */ }
```

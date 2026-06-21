# Masking Reference

## The one rule

**Masking is ONLY for content that genuinely cannot match run-to-run, or a delta the team has deliberately and explicitly chosen.** That means:

- Dynamic/volatile content: countdown timers, live counters, clocks, relative timestamps.
- Rendering artifacts the diff can't normalize: scrollbars, text carets, focus rings.
- Case-by-case: content the team has *deliberately changed* from the design — and only with an explicit `note` on the mask justifying it.

**Do NOT mask static layout to make a bad implementation pass.** Masking the banner, plan rows, CTA, or other static regions to push `mismatch_pct` under 2% is cheating — the differing pixels still exist, you've just stopped counting them. The skill now makes this visible and blocks it (see "Honesty guarantees" below).

Every mask must be itemized. Each entry in `report.masks[]` carries its `bbox`, `pixels`, and `source` (`selector` / `scrollbar` / `caret` / `manual`); deliberate design-delta masks must also carry a `note`.

## Honesty guarantees (enforced by diff.mjs)

- **Masked area is always reported.** `report.result.masked_pct` (of the full frame) and `report.masks_applied` are printed in the iteration summary every run — you always see "X% masked".
- **Masked-area guardrail.** If `masked_pct` exceeds `thresholds.max_masked_pct` (default **15%**, configurable in `pixel-perfect.json`), the run **cannot pass**: `passed` is forced `false` and `result.warning = "excessive_masking"`. This holds regardless of how low `mismatch_pct` is.
- **Dual mismatch numbers.** Besides the full-frame `mismatch_pct` (`mismatched / total`), the report includes `mismatch_pct_unmasked_basis` (`mismatched / (total − masked)`). The unmasked basis cannot be deflated by masking, so a high value there exposes a high density of differences hiding in a small visible area.
- **Pass requires BOTH** `mismatch_pct < max_mismatch_pct` AND `masked_pct < max_masked_pct`.

### Tuning the cap

```json
{ "thresholds": { "max_masked_pct": 15.0 } }
```

Raise it only with a real justification (e.g. a design that is legitimately mostly dynamic content). If you find yourself wanting to raise the cap to make a layout pass, fix the layout instead.

## Why masks exist

Figma renders text with its own hinter; Chromium uses a different one. Same font, same size, same color → different subpixel antialiasing → 3-8% "mismatch" on text-heavy UIs that's not actually a bug. Masking levels the playing field.

## Mask layers (applied in this order)

### 1. Text regions — auto, loose compare
Source: `mcp__figma-desktop__get_metadata` → text node bboxes.
Cross-reference: Playwright `locator(selector).boundingBox()` for each text element in impl.
Behavior: passed to `diff.mjs --masks` AND a separate pass runs text-only pixelmatch with `threshold=0.3` plus ΔE2000 color check (max ΔE < 3).

### 2. Dynamic content — from config
Source: `config.masks.selectors` (e.g., `[data-dynamic]`, `.avatar`, `time`).
Behavior: Playwright resolves to bboxes. Added to `--masks` array. Fully ignored.

### 3. Scrollbar — auto
`diff.mjs` injects the 16px-wide right column as a mask when `config.masks.mask_scrollbar=true`.

### 4. Carets + focus rings — at capture
`capture.mjs` injects `caret-color: transparent !important` via style tag, blurs `document.activeElement`, passes `caret: 'hide'` to Playwright's `screenshot()`.

## When masks go wrong

- **Over-masking** — diff looks like it passes but the implementation is broken. Signals: large blue overlay in diff.png; high `masked_pct`; `mismatch_pct` low but `mismatch_pct_unmasked_basis` high; `result.warning = "excessive_masking"`. Fix the implementation or tighten selectors — do not raise the cap to get a green.
- **Under-masking** — diff fails on AA noise. Check text bboxes are wide enough (+4px padding helps).

## Adding a new dynamic mask

Edit `.pixel-perfect/pixel-perfect.json`:

```json
{
  "masks": {
    "selectors": ["[data-dynamic]", ".avatar", "time", ".live-counter"]
  }
}
```

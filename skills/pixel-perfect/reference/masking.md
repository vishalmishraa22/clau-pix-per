# Masking Reference

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

- **Over-masking** — diff passes but implementation is broken. Blue overlay in diff.png too large → tighten selectors.
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

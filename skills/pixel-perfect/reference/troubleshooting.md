# Troubleshooting

## Mismatch stuck at 3-5% and diff.png is noisy

Likely **font AA**. Check:
- `document.fonts.ready` actually resolved (see `capture.mjs`).
- Same font file used (Figma may show a fallback; browser loaded the real one — or vice versa).
- Text bbox masks from `get_metadata` cover the full glyph runs.

Fix: ensure the font is loaded in the impl the same way it is in Figma. If impossible (e.g., licensing), rely on text-only ΔE check, accept raw pixel % over 2% for that region.

## Mismatch jumps between iterations

Likely **non-deterministic capture**. Check:
- Network requests still firing (skeletons, late-loading images).
- Video/autoplay content — capture different frames.
- `prefers-reduced-motion` not honored.

Fix: set `waitUntil: 'networkidle'` (default in `capture.mjs`), add a `page.waitForTimeout(500)` after `fonts.ready` as a last resort.

## Dev server not running

`detect.mjs` writes `impl_url` but doesn't start the server. Claude checks via HTTP HEAD; if 503/connection refused, launches `npm run dev` in background. If the user's dev command needs env vars or arguments, Claude asks.

## Selector doesn't match

`capture.mjs` fails with `locator.waitFor` timeout. Common causes:
- Component behind a route (e.g., `/login` not `/`).
- Client-side rendered; needs a navigation step.
- `data-testid` removed in production build.

Fix: update `config.selector` and `config.impl_url` in `pixel-perfect.json`.

## Figma frame width != impl responsive breakpoint

Design at 1440 but impl only renders up to 1200. Two options:
- Set `impl_url` to a Storybook story at 1440 (if Storybook's in the stack).
- Adjust impl max-width and re-run.

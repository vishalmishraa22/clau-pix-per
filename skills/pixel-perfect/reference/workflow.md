# Workflow Reference

## First-run flow

1. User pastes Figma URL. Says "match this".
2. Claude detects no `.pixel-perfect/pixel-perfect.json` exists.
3. Runs `detect.mjs <cwd>`. Script:
   - Reads `package.json` for framework signals + dev script.
   - Detects port from dev command or default table (next=3000, vite=5173, storybook=6006, astro=4321, remix=3000, nuxt=3000, sveltekit=5173).
   - Writes `.pixel-perfect/pixel-perfect.json` with `impl_url` and skeleton thresholds.
   - Appends `.pixel-perfect/` to `.gitignore` (idempotent).
   - Registers project path in `~/.claude/skills/pixel-perfect/.projects.json`.
4. If `framework=null` (unknown), Claude ASKS user for dev URL + selector.
5. Claude verifies dev server is up (HTTP HEAD on `impl_url`). If not, starts it via the detected `dev_command` in a background bash.
6. Proceed to capture + diff loop.

## Per-iteration budget

- Capture: ~2-4s (Playwright launch dominates; can be reduced by sharing a single browser context across iterations — future optimization).
- Diff: ~100-300ms at 1440x900.
- Subagent (iteration 3+): ~15-30s including round-trip.

Budget 5 iterations ≈ 2-3 minutes wall time.

## When to force re-detection

- User switches framework (e.g., migrates Next → Vite).
- `dev_port` collides with a new process.
- `selector` no longer matches (component renamed).

Run: `node bin/detect.mjs <projectDir> --force`

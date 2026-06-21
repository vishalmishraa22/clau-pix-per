---
name: pixel-perfect:regression
description: "Stability gate: verify design hasn't drifted. Returns STABLE/UNSTABLE verdict."
argument-hint: "[Frame: <name>] [URL: <url>] [--fail-on <threshold>] [--baseline <path>]"
---

EXECUTE IMMEDIATELY.

## Parse Arguments

- `Frame:` — frame name to check
- `URL:` — implementation URL to capture
- `Figma:` — Figma URL (or use cached design.png)
- `--fail-on <n>` — exit with code 1 if mismatch > n% (for CI)
- `--baseline <path>` — use specific baseline design.png instead of fetching
- `--threshold <n>` — pixelmatch threshold (default from config)

## Preconditions

1. Require `.pixel-perfect/pixel-perfect.json` config exists
2. Require either cached design.png OR Figma URL provided
3. If --fail-on set, this is CI mode (minimal output, exit codes matter)

## Phase 1: Load Baseline

Priority order:
1. `--baseline <path>` — use specified file
2. `.pixel-perfect/design.png` — cached from last run
3. Fetch fresh from Figma URL via `fetch-figma.mjs`

If no baseline available → error with instructions

## Phase 2: Capture Current

1. Run `capture.mjs` against the URL
2. Use same viewport/selector as original config
3. Save to `.pixel-perfect/regression-impl.png`

## Phase 3: Compare

1. Run `diff.mjs` with the SAME masks as the original (same `--masks` and same
   `--max-masked` cap). Do not add masks here — adding masks at regression time
   hides drift.
2. Read `report.result.mismatch_pct`, `report.result.masked_pct`, and
   `report.result.passed` from the report.
3. Compare to baseline mismatch (from results.tsv iter 0 or last successful).

## Phase 4: Verdict

Calculate verdict based on:
- **STABLE** — `report.result.passed === true` (mismatch < 2% or < fail-on threshold, AND masking under the cap).
- **UNSTABLE** — `passed === false`: mismatch >= 2% (or >= fail-on threshold), OR `result.warning === "excessive_masking"` (masked_pct over cap). A low mismatch with the masking warning is UNSTABLE, not STABLE.
- **DRIFT** — mismatch increased >1% from baseline, or `masked_pct` increased materially from baseline.

## Output

### Interactive Mode (default)
```
## Pixel-Perfect Regression — {frame}

### Comparison
- Baseline: {baseline_mismatch}% (from {source})
- Current: {current_mismatch}%
- Delta: {delta}%

### Verdict: ✅ STABLE | ❌ UNSTABLE | ⚠️ DRIFT

### Changed Regions (if any)
- {region}: {delta}% change
- ...

### Artifacts
- Baseline: {path}
- Current: {path}
- Diff: {path}
```

### CI Mode (--fail-on)
```
pixel-perfect:regression {frame} — {verdict} ({mismatch}%)
```
Exit code: 0 = STABLE, 1 = UNSTABLE

## CI/CD Integration Example

```yaml
# .github/workflows/visual-regression.yml
- name: Visual Regression Gate
  run: |
    claude -p "/pixel-perfect:regression
    Frame: LoginCard
    URL: http://localhost:3000/login
    --fail-on 5"
```

## Handoff

If `--chain <targets>` was set, write the handoff via the module before invoking the
next command (`$BIN` = `<plugin>/skills/pixel-perfect/bin`):

```
node $BIN/handoff.mjs write --project <projectDir> \
  --source regression \
  --status COMPLETE \
  --verdict <STABLE|UNSTABLE|DRIFT> \
  --frame "<name>" --mismatch <current-pct> \
  --findings '<JSON array of {type,region,description,delta}>' \
  --config '<JSON snapshot>'
```

`--verdict` carries the regression result; `--mismatch` is the current mismatch and the
delta from baseline appears in `findings`. The module fills in `version`, `timestamp`,
`results_tsv`, and `artifacts`. A downstream command reads it with
`node $BIN/handoff.mjs read --project <projectDir>` and should refuse to ship on a
non-`STABLE` verdict.

---
name: pixel-perfect:evals
description: "Analyze results.tsv: trends, plateaus, patterns, recommendations"
argument-hint: "[--format text|json|md] [--file <path>]"
---

EXECUTE IMMEDIATELY.

## Parse Arguments

Extract from $ARGUMENTS:
- `--format` — output format: `text` (default), `json`, `md`
- `--file <path>` — specific TSV file (default: auto-discover)

If `--format` is absent, use `text`. If an unrecognized value is passed, fall back to `text` and note it in the output.

## Input Discovery

1. If `--file <path>` provided → use that TSV.
2. Else look for `.pixel-perfect/results.tsv` (relative to the project root / cwd).
3. If not found → STOP and output:
   ```
   No results.tsv found.
   Expected at: .pixel-perfect/results.tsv
   Run the pixel-perfect compare loop first, or pass --file <path>.
   ```

## Parse TSV

The file is tab-separated. The first lines may be `#`-prefixed header comments containing run metadata.

1. **Read header comments** (lines beginning with `#`). Extract these key/value pairs if present (format `# key: value`):
   - `metric_direction` — e.g. `lower_is_better` (mismatch %) — default to `lower_is_better` if absent.
   - `frame` — the frame/screen name being matched.
   - `figma_url` — source Figma URL.
2. **Read the column header row** (first non-`#`, non-empty line). Expected columns (tolerate missing/extra columns, match by name):
   - `iteration` — integer iteration index
   - `mismatch` — mismatch percentage (float, e.g. `4.21`)
   - `delta` — change vs previous kept iteration (signed float; negative = improvement when `lower_is_better`)
   - `decision` — `keep` or `discard` (also accept `kept`/`discarded`)
   - `region` — region(s) targeted this iteration (may be comma-separated or empty)
   - `description` — free-text description of the change attempted
   - `guard` — optional; `pass`/`fail` test/guard status
3. **Parse all data rows** into objects keyed by column name. Skip blank lines and `#` comment lines after the header. Coerce numeric fields; treat unparseable numerics as missing.

If zero data rows parse → STOP and output: `results.tsv has no data rows yet — run at least one compare iteration.`

## Analysis (implement all)

Normalize `decision`: `keep`/`kept` → kept; `discard`/`discarded` → discarded.
For `delta` interpretation, respect `metric_direction`. For `lower_is_better` (the default), a **negative** delta is an improvement and a **positive** delta is a regression.

### Key Metrics
- **Total iterations** = count of data rows.
- **Kept** = count of kept rows. **Discarded** = count of discarded rows.
- **Revert rate** = `discarded / total` as a percentage (1 decimal).
- **Starting mismatch** = `mismatch` of the first iteration.
- **Final mismatch** = `mismatch` of the last iteration (or last kept iteration if the last row was discarded and reverted — prefer the effective current state).
- **Total improvement %** = `starting - final` (absolute points). Also compute relative: `(starting - final) / starting * 100` when starting > 0.

### Trend Analysis
- **Metric progression** — classify over kept iterations:
  - `improving` — mismatch trends downward consistently.
  - `plateau` — see plateau detection below.
  - `oscillating` — mismatch alternates up/down across iterations without net convergence.
- **Plateau detection** — flag a plateau if `|delta| < 0.2%` for **3+ consecutive iterations**. Report the iteration where the plateau begins.
- **Biggest win** — the iteration with the largest **negative** delta (greatest single-step improvement). Report iteration, delta, and description.
- **Biggest loss** — the iteration with the largest **positive** delta before a revert (largest single regression). Report iteration, delta, and description.
- **Diminishing returns** — find the first iteration after which the running average of `|delta|` drops below `0.3%`. Report that iteration (or "not detected").

### Pattern Analysis
- **Successful changes** — collect `description` text from kept rows; extract the top recurring keywords/phrases (e.g. padding, margin, font-size, color, gap, line-height). Report top 3.
- **Failed changes** — same for discarded rows. Report top 3.
- **Region hotspots** — tally the `region` column across kept rows; report the regions appearing most often in successful fixes.
- **Guard failure rate** — if a `guard` column exists, `count(guard == fail) / count(rows with guard value)` as a percentage. Otherwise omit.

### Recommendations
Pick exactly ONE, in this priority order:
1. If guard column present and guard failure rate > 20% →
   `"Guard failures high ({n}%) — investigate test stability"`
2. If the same region dominates discarded rows and mismatch is not improving →
   `"Stuck on {region} — consider masking or manual intervention"`
3. If a plateau is detected →
   `"Consider stopping — plateau detected at iteration {n}"`
4. Otherwise →
   `"Continue — good velocity, {imp}% improvement in last 3 iterations"`
   (where `{imp}` = sum of improvement over the last 3 kept iterations)

## Output Format

### Text (default)

```
## Pixel-Perfect Evals — {frame}

### Key Metrics
- Total iterations: {n} | Kept: {k} | Discarded: {d} | Revert rate: {r}%
- Mismatch: {start}% → {end}% | Improvement: {imp}%

### Trend Analysis
- Progression: {trend}
- Plateau: {detected at iter N / none}
- Biggest win: iter {n} ({delta}%, "{description}")
- Diminishing returns: {after iter N / not detected}

### Patterns
- Successful changes: {top 3 description keywords}
- Failed changes: {top 3 description keywords}
- Hot regions: {regions with most changes}

### Recommendation
{one-line recommendation}
```

Omit the `Guard failures` aspects from patterns if no guard column exists.

### JSON (`--format json`)

Output a single JSON object (no prose around it):

```json
{
  "frame": "...",
  "figma_url": "...",
  "metric_direction": "lower_is_better",
  "key_metrics": {
    "total_iterations": 0,
    "kept": 0,
    "discarded": 0,
    "revert_rate_pct": 0.0,
    "start_mismatch": 0.0,
    "final_mismatch": 0.0,
    "improvement_pct": 0.0,
    "improvement_relative_pct": 0.0
  },
  "trend": {
    "progression": "improving|plateau|oscillating",
    "plateau_iteration": null,
    "biggest_win": { "iteration": 0, "delta": 0.0, "description": "" },
    "biggest_loss": { "iteration": 0, "delta": 0.0, "description": "" },
    "diminishing_returns_iteration": null
  },
  "patterns": {
    "successful_keywords": [],
    "failed_keywords": [],
    "hot_regions": [],
    "guard_failure_rate_pct": null
  },
  "recommendation": "..."
}
```

### Markdown (`--format md`)

Render the same content as the Text format, then **write it to `.pixel-perfect/evals-summary.md`** (next to the source TSV, or next to `--file` if provided). Confirm the written path in your reply.

## Example Usage

```
/pixel-perfect:evals
/pixel-perfect:evals --format json
/pixel-perfect:evals --file .pixel-perfect/results.tsv --format md
```

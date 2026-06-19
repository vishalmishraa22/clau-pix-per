---
name: pixel-perfect:compare
description: "Compare two implementations against the same Figma design — side-by-side diff"
argument-hint: "[--a <url>] [--b <url>] [Figma: <url>] [--selector <css>]"
---

EXECUTE IMMEDIATELY.

Run Preflight from SKILL.md first (bootstrap check, Figma MCP check).

## Parse Arguments

- `--a <url>` — First implementation URL (e.g., http://localhost:3000)
- `--b <url>` — Second implementation URL (e.g., http://staging.example.com)
- `Figma:` — Figma frame URL (source of truth)
- `--selector` — CSS selector (applied to both captures)
- `--viewport` — Override viewport "WIDTHxHEIGHT"

## Setup

If any required URL missing, use **AskUserQuestion**:

**Q1:** "First implementation URL (A)?"
- Options: localhost:3000, localhost:5173, custom

**Q2:** "Second implementation URL (B)?"
- Options: staging URL, production URL, custom

**Q3:** "Figma frame URL?" (or use cached design.png)

## Phase 1: Capture Design

If `.pixel-perfect/design.png` exists and is < 1 hour old, reuse it.
Otherwise fetch fresh:

```bash
node $BIN/fetch-figma.mjs --file <fileKey> --node <nodeId> --out .pixel-perfect/compare/design.png
```

## Phase 2: Capture Implementations

Capture both implementations in parallel:

```bash
node $BIN/capture.mjs --url <url_a> --selector <sel> --width <w> --height <h> --out .pixel-perfect/compare/impl-a.png
node $BIN/capture.mjs --url <url_b> --selector <sel> --width <w> --height <h> --out .pixel-perfect/compare/impl-b.png
```

## Phase 3: Run Diffs

Compare each implementation against the design:

```bash
node $BIN/diff.mjs --design design.png --impl impl-a.png --out .pixel-perfect/compare/diff-a --threshold 0.1
node $BIN/diff.mjs --design design.png --impl impl-b.png --out .pixel-perfect/compare/diff-b --threshold 0.1
```

## Phase 4: Compare Results

Parse both `report.json` files and compare:

```
A mismatch: {a_pct}%
B mismatch: {b_pct}%
Delta: {difference}%
Winner: {A or B} (closer to design)
```

## Output

```
## Pixel-Perfect Compare

### Design Reference
- Figma: {frame_name} ({width}x{height})
- Source: {figma_url or "cached"}

### Implementation A: {url_a}
- Mismatch: {a_pct}%
- Status: {PASS (<2%) or FAIL (>=2%)}

### Implementation B: {url_b}
- Mismatch: {b_pct}%
- Status: {PASS (<2%) or FAIL (>=2%)}

### Comparison
- **Winner:** {A or B} ({winner_pct}% vs {loser_pct}%)
- **Delta:** {abs(a - b)}%

### Key Differences
Regions where A and B diverge most from each other:
- {region}: A={a_region_pct}%, B={b_region_pct}%

### Artifacts
.pixel-perfect/compare/
├── design.png
├── impl-a.png
├── impl-b.png
├── diff-a/
│   ├── diff.png
│   └── report.json
└── diff-b/
    ├── diff.png
    └── report.json
```

## Use Cases

1. **Staging vs Production** — Verify deployment didn't drift
   ```
   /pixel-perfect:compare --a http://localhost:3000 --b https://staging.example.com
   ```

2. **Branch Comparison** — Compare two feature branches
   ```
   /pixel-perfect:compare --a http://localhost:3000 --b http://localhost:3001
   ```

3. **Before/After** — Compare implementation before and after a fix
   ```
   /pixel-perfect:compare --a http://localhost:3000 --b http://localhost:3000?v=2
   ```

## Handoff

Write `handoff.json`:
```json
{
  "version": "2.0.0",
  "source": "compare",
  "status": "COMPLETE",
  "frame": "<frame_name>",
  "comparison": {
    "a": { "url": "<url_a>", "mismatch": <a_pct> },
    "b": { "url": "<url_b>", "mismatch": <b_pct> },
    "winner": "a|b",
    "delta": <abs_diff>
  }
}
```

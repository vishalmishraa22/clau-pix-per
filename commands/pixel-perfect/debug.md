---
name: pixel-perfect:debug
description: "Diagnose stuck diffs with hypothesis-driven investigation"
argument-hint: "[Frame: <name>] [Symptom: <description>] [--technique <type>] [Iterations: N]"
---

EXECUTE IMMEDIATELY.

## Parse Arguments

- `Frame:` — frame name to debug (or auto-detect from results.tsv)
- `Symptom:` — what's wrong (e.g., "stuck at 4%", "text regions noisy")
- `--technique` — force specific technique: font, spacing, color, mask, layout
- `Iterations:` — max hypothesis iterations (default 10)

## Setup

1. Load `.pixel-perfect/results.tsv` — get recent iterations
2. Load latest `report.json` — get current mismatch regions
3. Load `diff.png` — visual reference
4. If no recent run, error: "Run /pixel-perfect first to generate baseline"

## Investigation Techniques

| Technique | When to Use | Evidence to Collect |
|-----------|-------------|---------------------|
| Font Analysis | Text regions contribute >50% of diff | font-family, weight, size, line-height, letter-spacing in both design and impl |
| Spacing Analysis | Gap/margin issues visible in diff | measured gaps vs Figma specs |
| Color Analysis | Color regions show high ΔE | extract hex values, calculate ΔE2000 |
| Mask Audit | Noise from dynamic content | check if text regions are being masked correctly |
| Layout Analysis | Structural differences | flex/grid properties, positioning |
| Browser Quirks | Cross-browser variance | check shadow rendering, border-radius, subpixel |

## Iteration Loop

### Phase 1: Analyze Current State
- Read results.tsv for pattern (what's been tried, what worked/failed)
- Identify stuck regions from report.json `regions_of_concern`
- Calculate contribution of each region to total mismatch

### Phase 2: Form Hypothesis
- Based on evidence, form ONE specific, testable hypothesis
- Format: "I hypothesize that {X} because {evidence}. Test by {method}."
- Hypothesis must be different from all previous

### Phase 3: Investigate
- Apply the appropriate technique
- Collect concrete evidence (measurements, values, comparisons)
- Reference specific file:line if code-related

### Phase 4: Classify
- **confirmed** — hypothesis correct, root cause identified
- **disproven** — hypothesis wrong, evidence against it
- **inconclusive** — needs different approach

### Phase 5: Log
- Record hypothesis, technique, evidence, classification
- If confirmed: add to findings list

### Phase 6: Saturation Check
- If 3 consecutive inconclusive → recommend manual inspection
- If 2+ confirmed findings → output summary

## Output

```
## Pixel-Perfect Debug — {frame}

### Current State
- Mismatch: {current}% (stuck for {n} iterations)
- Primary diff regions: {list}

### Investigation ({n} hypotheses tested)

#### Confirmed Findings
1. **Font rendering mismatch** (confidence: HIGH)
   - Evidence: Inter font not loaded, falling back to system-ui
   - Impact: ~3.2% of total mismatch
   - Fix: Add font preload or increase text_pixelmatch_threshold

2. **Shadow blur variance** (confidence: MEDIUM)
   - Evidence: box-shadow blur 24px renders differently in Chrome vs Figma
   - Impact: ~0.8% of total mismatch
   - Fix: Use consistent shadow or mask region

### Recommendations (priority order)
1. Add `<link rel="preload" href="/fonts/Inter.woff2">` to fix font loading
2. Increase text_pixelmatch_threshold from 0.1 to 0.3
3. Consider masking shadow region if visual fidelity not critical

### If Still Stuck
- Run `/pixel-perfect:reason` for adversarial debate on fix approaches
- Manually inspect diff.png at {path}
```

## Techniques Deep Dive

### Font Analysis
```
1. Extract text nodes from Figma via get_metadata
2. Query computed styles in browser via Playwright
3. Compare:
   - font-family (exact match or fallback?)
   - font-weight (400 vs normal?)
   - font-size (px values)
   - line-height (unitless vs px)
   - letter-spacing
   - text-rendering (auto vs optimizeLegibility)
4. Check if web font is actually loaded (document.fonts API)
```

### Spacing Analysis
```
1. Identify gap regions in diff.png (red areas between elements)
2. Measure in Figma: gap, padding, margin values
3. Measure in browser: computed box model
4. Compare and report delta in px
```

### Color Analysis
```
1. Extract color values from stuck regions
2. Convert to Lab color space
3. Calculate ΔE2000 between design and impl
4. ΔE > 3.0 is visible to human eye
```

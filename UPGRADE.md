# Upgrade Guide: v1.0 → v2.0

This guide helps existing pixel-perfect users upgrade to v2.0 smoothly.

## Quick Upgrade (2 minutes)

If you just want to upgrade without understanding the changes:

```bash
# In Claude Code prompt:
/plugin update pixel-perfect@clau-pix-per
/reload-plugins
```

Done! Your existing config and workflows continue to work.

---

## What Changes for You

### Nothing Breaks

v2.0 is **fully backward compatible**:

| What | Status |
|------|--------|
| Your `.pixel-perfect/pixel-perfect.json` | ✅ Works as-is |
| Your Figma PAT location | ✅ Unchanged |
| `/pixel-perfect` command | ✅ Same behavior |
| Existing masks and thresholds | ✅ Preserved |

### What's Different

1. **Faster invocations** — The skill loads 78% less content
2. **Better stuck handling** — Use `/pixel-perfect:debug` instead of staring at diff.png
3. **History tracking** — Results logged to TSV, survives sessions
4. **Auto-rollback** — Bad fixes are reverted automatically

---

## New Commands Available

After upgrading, you have 5 new commands:

### `/pixel-perfect:plan` — Setup Wizard

Instead of manually creating config, use the wizard:

```
/pixel-perfect:plan
Figma: https://figma.com/design/ABC/MyFile?node-id=1-23
```

It validates Figma access, checks your dev server, and writes the config.

### `/pixel-perfect:debug` — Stuck Diff Diagnosis

When stuck at 3-5% mismatch:

```
/pixel-perfect:debug
```

It analyzes WHY you're stuck (font rendering? spacing? masking?) and suggests fixes.

### `/pixel-perfect:evals` — Trend Analysis

After running the main loop:

```
/pixel-perfect:evals
```

Shows: what types of fixes worked, where you plateaued, recommendations.

### `/pixel-perfect:regression` — CI Gate

For CI/CD pipelines:

```
/pixel-perfect:regression --fail-on 5
```

Exits with code 1 if mismatch > 5%. Perfect for GitHub Actions.

### `/pixel-perfect:compare` — Side-by-Side

Compare two implementations:

```
/pixel-perfect:compare --a http://localhost:3000 --b https://staging.example.com
```

---

## New Features to Try

### 1. Guard Command

Prevent visual fixes from breaking tests:

```
/pixel-perfect
Figma: https://...
URL: http://localhost:3000
Guard: npm test
```

### 2. Chain Commands

Run analysis after the main loop:

```
/pixel-perfect --chain evals
```

### 3. Results History

Check your iteration history:

```bash
cat .pixel-perfect/results.tsv
```

Or analyze it:

```
/pixel-perfect:evals
```

---

## Config Migration (Optional)

Your v1 config works fine, but v2 adds new optional fields.

### v1 Config (still works)

```json
{
  "version": 1,
  "impl_url": "http://localhost:3000",
  "selector": "body",
  "viewport": { "width": 1440, "height": 900 },
  "thresholds": {
    "global_max_mismatch_pct": 2.0,
    "pixelmatch_threshold": 0.1
  },
  "masks": {
    "selectors": ["[data-dynamic]"],
    "mask_scrollbar": true
  }
}
```

### v2 Config (new fields)

```json
{
  "version": 2,
  "impl_url": "http://localhost:3000",
  "selector": "body",
  "viewport": { "width": 1440, "height": 900 },
  "figma": {
    "url": "https://figma.com/design/ABC/...",
    "fileKey": "ABC",
    "nodeId": "1:23",
    "width": 1440,
    "height": 900
  },
  "guard": "npm test",
  "thresholds": {
    "global_max_mismatch_pct": 2.0,
    "pixelmatch_threshold": 0.1,
    "text_pixelmatch_threshold": 0.3,
    "text_color_deltaE_max": 3.0
  },
  "masks": {
    "selectors": ["[data-dynamic]"],
    "mask_scrollbar": true,
    "mask_carets": true
  }
}
```

**New fields:**
- `figma` block — Caches Figma URL and dimensions
- `guard` — Optional test command
- `text_pixelmatch_threshold` — Looser threshold for text regions
- `text_color_deltaE_max` — Color accuracy for text
- `mask_carets` — Hide blinking cursors

To migrate: just run `/pixel-perfect:plan` and it'll write a v2 config.

---

## Hooks (Automatic)

v2 includes 5 hooks that run automatically:

| Hook | What It Does |
|------|--------------|
| `iteration-context` | Injects TSV state after context compaction |
| `subagent-context` | Gives subagents current mismatch/iteration |
| `session-cleanup` | Cleans `.pixel-perfect/runs/` older than 24h |
| `completion-notify` | Terminal notification when done |
| `figma-token-check` | Warns if PAT missing on session start |

These are opt-out via environment variables:

```bash
export PP_DISABLE_ITERATION_CONTEXT=1
export PP_DISABLE_SESSION_CLEANUP=1
# etc.
```

---

## Troubleshooting

### "Command not found: /pixel-perfect:debug"

Reload plugins:
```
/reload-plugins
```

### "SKILL.md is huge again"

You might have an old cached version. Clear and reinstall:
```
/plugin uninstall pixel-perfect@clau-pix-per
/plugin install pixel-perfect@clau-pix-per
/reload-plugins
```

### "TSV file not created"

The TSV is created on first iteration. Run the main loop once:
```
/pixel-perfect
```

### "Hooks not firing"

Check that `hooks/hooks.json` exists in the plugin directory. If not, reinstall.

---

## Getting Help

- **Issues:** https://github.com/vishalmishraa22/clau-pix-per/issues
- **Discussions:** https://github.com/vishalmishraa22/clau-pix-per/discussions

---

## Rollback to v1.0

If you need to rollback (not recommended):

```bash
# In your terminal (not Claude Code):
cd ~/.claude/plugins/cache/*/clau-pix-per/*/
git checkout v0.1.0
```

Then `/reload-plugins` in Claude Code.

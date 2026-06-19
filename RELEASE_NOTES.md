# Release Notes — v2.0.0

> **Autoresearch-Inspired Architecture Overhaul**
> 
> A complete reimagining of pixel-perfect based on patterns from [autoresearch](https://github.com/uditgoenka/autoresearch) — the autonomous iteration framework.

## What's New

### 1. Command Decomposition (78% Smaller Core)

**Before:** One 207-line monolithic `SKILL.md` loaded on every invocation (~25K tokens).

**After:** 51-line thin router + 6 focused subcommands. Only the invoked command loads.

| Command | Purpose | Default |
|---------|---------|---------|
| `/pixel-perfect` | Main iteration loop | 5 iterations |
| `/pixel-perfect:plan` | Interactive setup wizard | one-shot |
| `/pixel-perfect:debug` | Diagnose stuck diffs | 10 iterations |
| `/pixel-perfect:evals` | Analyze trends & patterns | one-shot |
| `/pixel-perfect:regression` | CI stability gate | one-shot |
| `/pixel-perfect:compare` | Side-by-side comparison | one-shot |

### 2. TSV Results Logging

Every iteration is now logged to `.pixel-perfect/results.tsv`:

```
# metric_direction: lower_is_better
# frame: LoginCard
iteration  timestamp            commit   mismatch  delta   status   description
0          2026-06-20T10:30:00  a1b2c3d  12.4      0.0     baseline initial state
1          2026-06-20T10:31:15  b2c3d4e  8.1       -4.3    keep     fix padding
2          2026-06-20T10:32:30  c3d4e5f  5.3       -2.8    keep     border-radius
```

**Benefits:**
- Track progress across sessions
- Analyze patterns with `/pixel-perfect:evals`
- Auto-calculate delta from previous iteration
- Never lose iteration history

### 3. Git-Based Rollback

Every fix is committed BEFORE re-verification. If it causes regression, it's auto-reverted:

```
Iteration 3:
  → Edit CSS
  → git commit -m "experiment: pixel-perfect iter3 — adjust margin"
  → Re-capture, re-diff
  → Mismatch increased? → git revert HEAD --no-edit
  → Log status: "discard"
```

**Benefits:**
- Never get stuck worse than you started
- Cherry-pick successful fixes to other components
- Full audit trail of what worked/failed

### 4. Guard Mechanism

Optional test suite that must pass alongside the visual diff:

```
/pixel-perfect
Figma: https://figma.com/design/...
URL: http://localhost:3000
Guard: npm test
```

If a visual fix breaks tests, it's reverted and an alternative approach is tried.

### 5. Hook System

5 hooks for context injection and safety:

| Hook | Event | Purpose |
|------|-------|---------|
| `iteration-context` | UserPromptSubmit | Inject last 3 TSV rows |
| `subagent-context` | SubagentStart | Give subagents current state |
| `session-cleanup` | SessionEnd | Clean runs older than 24h |
| `completion-notify` | SessionEnd | Terminal notification |
| `figma-token-check` | SessionStart | Validate PAT exists |

### 6. Chain Handoff Protocol

Commands can chain to each other via `handoff.json`:

```
/pixel-perfect --chain evals,regression
```

Each command writes context for the next — zero copy-paste, zero context loss.

### 7. New Analysis Commands

**`/pixel-perfect:evals`** — Analyze your results.tsv:
- Trend analysis (improving, plateau, oscillating)
- Plateau detection (delta < 0.2% for 3+ iterations)
- Pattern analysis (what types of fixes succeed/fail)
- Actionable recommendations

**`/pixel-perfect:debug`** — Diagnose stuck diffs:
- Font analysis (rendering differences)
- Spacing analysis (measured gaps vs Figma)
- Color analysis (ΔE2000 calculation)
- Mask audit (are text regions masked correctly?)

**`/pixel-perfect:regression`** — CI stability gate:
- One-shot mismatch check
- STABLE/UNSTABLE/DRIFT verdict
- `--fail-on 5` exits with code 1 if mismatch > 5%

---

## Comparison: v1.0 vs v2.0

| Feature | v1.0 | v2.0 |
|---------|------|------|
| SKILL.md size | 12.6 KB | 2.8 KB (-78%) |
| Commands | 1 monolithic | 6 focused |
| Token cost | ~25K per invocation | ~5-12K |
| Results tracking | Per-run only | TSV across sessions |
| Rollback | Manual | Auto git commit/revert |
| Guard | None | Optional test suite |
| Analysis | None | `/pixel-perfect:evals` |
| CI gate | None | `/pixel-perfect:regression` |
| Context after compaction | Lost | Hooks inject state |
| Command chaining | None | `--chain` flag |

---

## Installation

### New Users

```bash
# In Claude Code prompt:
/plugin marketplace add vishalmishraa22/clau-pix-per
/plugin install pixel-perfect@clau-pix-per
/reload-plugins
```

### Existing Users (Upgrade)

See [UPGRADE.md](UPGRADE.md) for the full upgrade guide.

Quick version:
```bash
# In Claude Code prompt:
/plugin update pixel-perfect@clau-pix-per
/reload-plugins
```

Your existing `.pixel-perfect/pixel-perfect.json` config is compatible — v2.0 reads v1 configs.

---

## Breaking Changes

None! v2.0 is fully backward compatible:

- v1 configs are read without modification
- The main `/pixel-perfect` command works the same way
- Existing Figma PAT location unchanged

---

## Credits

Architecture inspired by [autoresearch](https://github.com/uditgoenka/autoresearch) by Udit Goenka — the autonomous iteration framework that pioneered:
- Thin routing + focused command modules
- TSV results logging with git as memory
- Guard mechanism for safety
- Chain handoff protocol

---

## What's Next (Roadmap)

- `/pixel-perfect:predict` — Multi-persona analysis before starting
- `/pixel-perfect:reason` — Adversarial debate when stuck
- `/pixel-perfect:scenario` — Edge case generation (viewports, themes, states)
- `/pixel-perfect:batch` — Process multiple Figma frames
- Webhook notifications on completion

---
name: pixel-perfect
description: Use when implementing from a Figma design, verifying a UI matches Figma, or the user says 'pixel perfect', 'match the design', 'compare to Figma', or passes a Figma URL/frame. Also triggers automatically after Figma MCP tools (get_design_context, get_screenshot) are used to generate code. Routes to focused subcommands that run an iterative diff loop (Figma PNG vs. Playwright screenshot, normalized via sharp, compared via pixelmatch) until <2% mismatch.
version: 2.0.0
---

# Pixel-Perfect — Visual Diff Iteration

Thin router. Each subcommand owns its own protocol — read the matching file in
`commands/` before executing.

## Safety Invariants

- Never claim pixel-perfect without a real `pixelmatch` run (via `bin/diff.mjs`). No eyeballing.
- Bounded by default (5 iterations). Override with `Iterations: N`.
- All results logged to `.pixel-perfect/results.tsv` (via `bin/results.mjs`).
- Git commit before verify, auto-revert on regression.
- On any bail condition: STOP and ask the user a concrete multi-choice question. Never iterate silently.

## Subcommands

| Command | Does | Default |
|---------|------|---------|
| `/pixel-perfect` | Iterate: capture → diff → fix → repeat | 5 iters |
| `/pixel-perfect:plan` | Interactive setup wizard | one-shot |
| `/pixel-perfect:debug` | Diagnose stuck diffs | 10 iters |
| `/pixel-perfect:evals` | Analyze results.tsv trends | one-shot |
| `/pixel-perfect:regression` | Stability gate (STABLE/UNSTABLE) | one-shot |
| `/pixel-perfect:compare` | Compare two implementations | one-shot |

## Universal Flags

| Flag | Purpose |
|------|---------|
| `Iterations: N` | Set iteration cap |
| `Guard: <cmd>` | Safety command that must pass each iteration |
| `--evals` | Enable mid-loop checkpoints |
| `--chain <targets>` | Chain to next command on completion (writes `handoff.json`) |

## Preflight (all commands)

1. **Bootstrap check.** If `<plugin_root>/skills/pixel-perfect/node_modules/` or `.bootstrap-done` is missing, announce "Installing pixel-perfect dependencies (one-time, ~60-90s)…" and run `node <plugin_root>/scripts/bootstrap.mjs`. If it exits non-zero, STOP and surface the error.
2. **Figma MCP check.** Require Figma MCP tools (`get_design_context`, `get_metadata`, `get_screenshot`) — either `mcp__claude_ai_Figma__*` (claude.ai) or `mcp__figma-desktop__*` (desktop). If absent, STOP and tell the user to install/configure the Figma MCP server, then restart.
3. **Git status.** Warn if the working tree is dirty before mutating code.

## Bundled tooling

Node scripts at `<plugin_root>/skills/pixel-perfect/bin/` (all CLI-callable via Bash):
`detect.mjs` · `fetch-figma.mjs` · `capture.mjs` · `diff.mjs` · `results.mjs` · `git-ops.mjs` · `handoff.mjs` · `cleanup.mjs`.
See `commands/pixel-perfect.md` for invocation details and the full loop protocol.

---
name: pixel-perfect:plan
description: "Interactive setup wizard — validate config before starting the diff loop"
argument-hint: "[Figma: <url>] [URL: <url>] [--selector <css>] [--guard <cmd>] [--viewport WxH]"
---

EXECUTE IMMEDIATELY.

Run Preflight from SKILL.md first (bootstrap check, Figma MCP check, git status).
`<plugin_root>` below is the directory containing this plugin; bundled scripts live at
`<plugin_root>/skills/pixel-perfect/bin/`.

## Parse Arguments

- `Figma:` — Figma frame URL
- `URL:` — implementation (dev server) URL
- `--selector` — CSS selector for the element to capture
- `--guard` — guard command run after each fix (e.g. `npm test`)
- `--viewport` — override viewport as `WIDTHxHEIGHT`

## Phase 1: Gather Requirements

For any required value still missing after parsing, ask with a single batched
AskUserQuestion call:

- **Figma frame URL** — must match `https://www.figma.com/design/<fileKey>/<name>?node-id=<nodeId>`.
  Extract `fileKey` and `nodeId` (convert `1-23` → `1:23`).
- **Implementation URL** — suggest `http://localhost:3000`, `http://localhost:5173`, or custom.
- **CSS selector** — auto-suggest from common patterns (`body`, `#app`, `.main`, `[data-testid="…"]`)
  or custom.
- **Guard** — `npm test`, `npm run test`, `yarn test`, or skip.

## Phase 2: Validate Figma Access

1. **PAT exists.** Check `$FIGMA_TOKEN`, then `~/.claude/pixel-perfect/.figma-token`.
   If missing, point the user to https://www.figma.com/settings to create a token and
   tell them to save it to `~/.claude/pixel-perfect/.figma-token` (one line) or export
   `FIGMA_TOKEN`, then retry.
2. **Frame fetch.** Validate access and the node-id by fetching the frame:
   `node <plugin_root>/skills/pixel-perfect/bin/fetch-figma.mjs --file <fileKey> --node <nodeId> --out .pixel-perfect/runs/_plan/design.png`
   - Exit 10 → no token (see step 1). Exit 20 → API/auth/node error: surface the message.
   - On success, read the PNG dimensions to record frame `width`/`height`.
3. **Figma MCP available.** Require `mcp__claude_ai_Figma__get_design_context` (and
   `get_metadata`). If absent, STOP with install instructions.

## Phase 3: Validate Implementation

1. **URL reachable.** HTTP GET, expect 200. If it fails, suggest starting the dev server
   (use the detected `dev_command` from step 3).
2. **Selector exists.** Use Playwright (via `bin/capture.mjs`) to verify the selector matches
   exactly one element. 0 matches → suggest alternatives; >1 → warn about ambiguity.
3. **Framework detection.** Run `node <plugin_root>/skills/pixel-perfect/bin/detect.mjs <projectDir>`
   to get `framework`, `dev_command`, `dev_port`, and default `impl_url`. Merge into the answers.
   Also note whether `graphify-out/` is present (the detector reports this) and, if so, offer to
   auto-resolve the component file from the frame name.

## Phase 4: Validate Guard (if set)

1. Run the guard command once. 2. If it fails, warn but do not block. 3. Record the baseline
   guard status.

## Phase 5: Write Config

Merge into `.pixel-perfect/pixel-perfect.json` (flat schema; preserve existing keys, fill the
blanks):

```json
{
  "version": 2,
  "figma": { "url": "https://…", "fileKey": "ABC123", "nodeId": "1:23", "width": 1440, "height": 900 },
  "impl_url": "http://localhost:3000",
  "selector": "body",
  "viewport": { "width": 1440, "height": 900 },
  "dev_command": "npm run dev",
  "dev_port": 3000,
  "framework": "next",
  "guard": "npm test",
  "thresholds": {
    "global_max_mismatch_pct": 2.0,
    "pixelmatch_threshold": 0.1,
    "text_pixelmatch_threshold": 0.3,
    "text_color_deltaE_max": 3.0
  },
  "masks": { "selectors": ["[data-dynamic]"], "mask_scrollbar": true, "mask_carets": true },
  "frame_map": {}
}
```

Confirm masks with the user: text bounding boxes from `get_metadata`, any dynamic-content
selectors, and scrollbar/caret masking.

## Phase 6: Summary

```
## Pixel-Perfect Setup Complete

### Configuration
- Figma: {frame name} ({width}x{height})
- Implementation: {url}
- Selector: {selector}
- Guard: {command or "none"}

### Validation
✅ Figma PAT valid
✅ Figma frame accessible
✅ Implementation URL reachable
✅ Selector found (1 match)
✅ Guard command passes

### Ready to Start
Run `/pixel-perfect` to begin the diff loop.

Or chain directly:
`/pixel-perfect:plan --chain pixel-perfect`
```

## Error Handling

For each validation failure, provide:
1. A clear error message.
2. Specific fix instructions.
3. The command to retry just that step.

On any unrecoverable failure, STOP and ask the user a concrete multi-choice question
(per SKILL.md safety invariants) — never iterate silently.

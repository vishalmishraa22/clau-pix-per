---
name: pixel-perfect
description: Use when implementing from a Figma design, verifying a UI matches Figma, or the user says 'pixel perfect', 'match the design', 'compare to Figma', or passes a Figma URL/frame. Also triggers automatically after Figma MCP tools (get_design_context, get_screenshot) are used to generate code — runs an iterative diff loop (design screenshot vs. Playwright screenshot, normalized via sharp, compared via pixelmatch) until <2% mismatch. Bails out and asks the user for guidance if (a) 5 iterations reached, (b) mismatch fails to decrease for 2 consecutive iterations, or (c) mismatch oscillates without converging.
---

# Pixel-Perfect Skill

**Rigid skill.** Follow the loop exactly. Do not skip steps. Do not substitute `eslint/format` or visual eyeballing for a real pixelmatch run.

## STEP 0 — Preflight (run before anything else on every activation)

**0a. Bootstrap check.** The skill's Node dependencies (sharp, pngjs, pixelmatch, playwright, commander) and Playwright Chromium are installed once via `scripts/bootstrap.mjs`. On first activation in a Claude Code install, they won't exist yet.

Locate the plugin root: the `SKILL.md` you are reading is at `<plugin_root>/skills/pixel-perfect/SKILL.md`, so `<plugin_root>` is two directories up.

```
if <plugin_root>/skills/pixel-perfect/node_modules/ does not exist
   OR <plugin_root>/skills/pixel-perfect/.bootstrap-done does not exist:
  announce to user: "Installing pixel-perfect dependencies (one-time, ~60-90s)…"
  Bash: node <plugin_root>/scripts/bootstrap.mjs
  if exit code != 0: STOP, surface the error to user, do not proceed.
```

**0b. Figma MCP availability check.** This skill requires the Figma MCP server for `get_design_context`, `get_metadata`, and `get_variable_defs`. Without it, text-bbox auto-masking is lost and diffs on text-heavy UIs will not hit <2%.

If `mcp__figma-desktop__get_design_context` (or equivalent Figma MCP tool) is NOT available in this session, STOP and tell the user:

> This skill requires the Figma MCP server. Install it from https://help.figma.com/hc/en-us/articles/32132100833559-Guide-to-the-Figma-MCP-server, configure it in your Claude Code MCP settings, then restart Claude Code and try again.

Do NOT proceed without Figma MCP. Note: Playwright MCP is NOT required — this skill uses the Playwright Node library directly via `capture.mjs`.

## When to trigger

- User passes a Figma URL / frame ID / says "match this design"
- Trigger phrases: "pixel perfect", "match the design", "compare to Figma", "is this matching Figma"
- Auto: immediately after you used `mcp__figma-desktop__get_design_context` or `get_screenshot` to generate code

## What this skill orchestrates

Five Node scripts at `<plugin_root>/skills/pixel-perfect/bin/`:

- `detect.mjs <projectDir>` — bootstraps `.pixel-perfect/` + `pixel-perfect.json`, writes `.gitignore`, detects framework/port/URL. Idempotent.
- `fetch-figma.mjs --file <fileKey> --node <nodeId> --out <path> [--scale 1]` — downloads a Figma frame as PNG via the Figma REST API. Reads the PAT in this order: `$FIGMA_TOKEN` → `~/.claude/pixel-perfect/.figma-token` (stable user path, chmod 600) → `<plugin_dir>/bin/.figma-token` (legacy fallback). Exits `10` with a JSON error if no token is configured.
- `capture.mjs --url <url> --selector <sel> --width <w> --height <h> --out <path>` — Playwright screenshot. Animations off, fonts waited, carets hidden.
- `diff.mjs --design <png> --impl <png> --out <dir> --threshold 0.1 --masks <json> --iteration <n>` — normalize → pixelmatch → writes `diff.png` + `report.json`. Prints report JSON on stdout.
- `cleanup.mjs <projectDir>` — deletes `.pixel-perfect/runs/*`. Keeps `pixel-perfect.json`.

All scripts are CLI-callable via Bash. Use the report JSON stdout to drive decisions.

## Figma PAT — required for STEP 3

The Figma MCP `get_screenshot` tool returns images inline to the conversation but does NOT expose a file path, so design.png cannot be written from the MCP call. The REST API is the only working path.

**Where the token lives** (first match wins):

1. `$FIGMA_TOKEN` environment variable.
2. `~/.claude/pixel-perfect/.figma-token` — stable user path, a single-line file, chmod 600. Survives plugin updates and cache wipes.
3. `<plugin_dir>/bin/.figma-token` — legacy in-plugin fallback (read-only, for pre-migration installs).

**If no token is found** (fetch-figma.mjs exits 10): **STOP and ASK the user.** Send them this exact message, verbatim:

> I need a Figma Personal Access Token to pull the design PNG. Opening the settings page now → https://www.figma.com/settings → **Security** → **Personal access tokens** → **Generate new token** (scope: `file_content:read`). Paste it here or set `FIGMA_TOKEN=figd_...` in your shell — I'll cache it to `~/.claude/pixel-perfect/.figma-token` (chmod 600) so you're not prompted again.

First try opening the Figma settings page in the user's browser to save them a click:
```bash
# macOS
open "https://www.figma.com/settings"
# Linux
xdg-open "https://www.figma.com/settings"
# Windows (WSL)
powershell.exe start "https://www.figma.com/settings"
```

When the user pastes a `figd_...` token, save it with:
```bash
mkdir -p ~/.claude/pixel-perfect && umask 077 && printf '%s\n' 'figd_...' > ~/.claude/pixel-perfect/.figma-token
```
Then warn them once: *"This token is now also in the conversation transcript — rotate it on figma.com/settings if the transcript is shared."*

**Extracting fileKey + nodeId from a Figma URL:**
`https://www.figma.com/design/:fileKey/:fileName?node-id=1-2` → `fileKey=:fileKey`, `nodeId=1:2` (replace `-` with `:`).

## The loop (DO NOT DEVIATE)

```
INPUT: Figma frame URL (or current Figma MCP selection)

STEP 1 — Bootstrap (once per project)
  if !.pixel-perfect/pixel-perfect.json exists OR user said "re-detect":
    Bash: node ~/.claude/skills/pixel-perfect/bin/detect.mjs <projectDir>
    parse stdout → config
    if framework is null: ASK user for dev URL + selector, then re-run detect

STEP 2 — Resolve component location (once per frame)
  if config.graphify.present:
    Read config.graphify.wiki_index (preferred) or config.graphify.graph_report
    Find the node/file that matches the Figma frame name or a slug of it
    If found: set config.selector / config.impl_url if not already set
              (e.g., frame "LoginCard" → src/components/LoginCard.tsx →
               infer route or Storybook story)
  else: fall through to config.selector / config.impl_url

STEP 3 — Capture design (once per frame)
  a. Bash: node bin/fetch-figma.mjs --file <fileKey> --node <nodeId> \
           --out .pixel-perfect/runs/<run_id>/design.png --scale 1
     → this writes design.png to disk via the Figma REST API.
     → if exit code 10 (NO_TOKEN): STOP. Prompt the user per the "Figma PAT" section, then resume.
     → if exit code 20 (API_FAIL): report the error message, ask the user to check the nodeId / file access.
  b. mcp__figma-desktop__get_design_context   → keep tokens/structure in context
  c. mcp__figma-desktop__get_metadata         → extract text node bboxes for masks
  d. If design.png width > figma_frame_width (Figma renders overflow content that extends past
     the frame — common when a horizontal scroll layout has cards outside the frame bounds),
     crop design.png with sharp to frame_width × frame_height using sharp.extract({left:0,top:0,width,height}).
  target_viewport_width = figma_frame_width

STEP 4 — Iteration loop (max 5)
  mkdir .pixel-perfect/runs/<timestamp>-<frame-slug>
  for i in 1..5:
    a. Bash: node bin/capture.mjs --url <config.impl_url> --selector <config.selector> \
             --width <target_viewport_width> --out runs/.../iter<i>-impl.png
    b. Bash: node bin/diff.mjs --design design.png --impl iter<i>-impl.png \
             --out runs/.../iter<i> --threshold <config.thresholds.pixelmatch_threshold> \
             --masks <json-array-of-bboxes> --iteration <i>
       parse stdout → report
    c. if report.result.mismatch_pct < 2.0: SUCCESS → goto STEP 4
    d. if i <= 2: YOU (main Claude) inspect diff.png, identify problem, edit code
       if i >= 3: DISPATCH SUBAGENT (general-purpose) with:
         - design.png, iter<i>-impl.png, diff.png, report.json
         - current component source
         - ask: "return a precise edit list to reduce the diff"
         apply returned edits inline
    e. BAIL CHECKS:
       - if report.result.mismatch_pct >= previous_mismatch_pct: stuck++
       - if stuck >= 2: STOP, goto STEP 5 (bail)
       - if mismatch oscillates (up-down-up pattern over 3 iterations): STOP, goto STEP 5

STEP 5 — SUCCESS
  Print report card (see format below). Wait for user confirmation.
  When user says "looks good" / "ship it" / "done" / "match confirmed" / approves PR:
    Bash: node bin/cleanup.mjs <projectDir>

STEP 6 — BAIL
  Print last 3 reports + diff.png path. Ask concrete multi-choice question:
    (a) apply my best hypothesis and re-run
    (b) mask <stuck region> and accept current state
    (c) you inspect diff.png and guide me
    (d) abort, restore last good state
  Wait for user direction. Do not iterate further without user input.
```

## Viewport strategy

- **Single Figma frame:** use its width, one pass.
- **Explicit mobile + desktop supplied:** run both in parallel via `superpowers:dispatching-parallel-agents`, one converging each.
- **Tablet (768):** only if user supplied a tablet Figma frame. Never fabricate a reference.

## Masking (how to hit <2%)

Always apply these to BOTH design.png and impl.png before diffing:

- **Text regions** (auto) — extract bboxes from `get_metadata`. Pass as `--masks` array. Compare separately with `text_pixelmatch_threshold=0.3` + ΔE check.
- **Dynamic** (from `config.masks.selectors`) — query Playwright for bboxes, add to masks.
- **Scrollbar** — `diff.mjs` adds this automatically if `config.masks.mask_scrollbar`.
- **Caret** — `capture.mjs` handles via CSS + `caret: 'hide'`.

## Report card format (what to print to user)

```
Pixel-perfect: <frame name> (<width>px)
  Iteration <n>/5 — <mismatch>% mismatch <✓ PASS or ✗ FAIL>

  Top regions of concern:
    • <pct>% — <note> (bbox x,y → x+w,y+h)

  Artifacts: .pixel-perfect/runs/<run_id>/
    design.png · impl.png · diff.png · report.json
```

## Hard rules

- NEVER claim pixel-perfect without a real `diff.mjs` run. No eyeballing. If the diff cannot be run (missing token, API error, dimension mismatch), STOP and ask the user for help — do not substitute a visual description of the Figma screenshot as "verification".
- NEVER iterate past 5 silently. Always bail and ask.
- NEVER delete `pixel-perfect.json` (only `runs/*`).
- NEVER skip `detect.mjs` bootstrap on a new project.
- NEVER invent a tablet Figma reference the user didn't supply.
- NEVER commit `bin/.figma-token` — it's in the skill's `.gitignore`. If asked to share the skill, instruct the recipient to generate their own PAT.
- On user confirmation of completion, ALWAYS run `cleanup.mjs`.

## Ask for help — when and how

This skill is rigid on purpose. When any of these happen, STOP and ask the user a concrete multi-choice question — do not silently paper over:

- `fetch-figma.mjs` exits 10 (NO_TOKEN): prompt for the PAT as described in the "Figma PAT" section.
- `fetch-figma.mjs` exits 20 (API_FAIL with 403/404): ask the user to verify the file is in an account they can access with their PAT, or to share the file read-only with the PAT owner.
- `diff.mjs` reports >50% mismatch on iteration 1: the design.png and impl.png almost certainly differ in viewport / scroll offset / content. Stop. Ask the user: "design shows X, impl shows Y — are we comparing the right viewport?"
- Figma frame width != impl viewport width by more than a few pixels after rendering: ask whether to crop design, resize impl, or both.
- Card/content coordinates from Figma metadata don't match the DOM positions you measured via Playwright: stop and report the delta before applying masks — misplaced masks will hide real regressions.
- After 2 iterations the mismatch has not decreased: DO NOT try a third edit blindly. Bail per STEP 6 and ask the user which region to prioritize.

The cost of asking is low. The cost of shipping a falsely-verified component is high.

## See also

- `reference/workflow.md` — expanded loop walkthrough
- `reference/masking.md` — mask details and edge cases
- `reference/troubleshooting.md` — common diff failures
- `reference/report-schema.md` — full report.json schema

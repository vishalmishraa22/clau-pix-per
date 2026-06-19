---
name: pixel-perfect
description: Iterate a UI implementation against a Figma frame until <2% pixel mismatch. Capture → diff → fix → commit → verify, bounded and logged.
argument-hint: "<figma-url> [impl-url] [selector] [Guard: <cmd>] [Iterations: N] [--evals] [--chain <targets>]"
---

# /pixel-perfect — Iteration Loop

**Rigid.** Follow the loop exactly. Do not skip steps. Do not substitute lint/format
or visual eyeballing for a real `diff.mjs` run. Read SKILL.md Safety Invariants first.

Let `$PLUGIN` = the plugin root (two dirs up from `skills/pixel-perfect/SKILL.md`).
Let `$BIN` = `$PLUGIN/skills/pixel-perfect/bin`.

## 1. Parse Arguments

From the invocation, extract:

- **Figma frame** — a `figma.com/design/:fileKey/...?node-id=A-B` URL, a bare node id,
  or the current Figma MCP selection. Derive `fileKey` and `nodeId` (`node-id=1-2` → `1:2`).
- **impl_url** — dev server URL for the implementation. If absent, fall through to
  `pixel-perfect.json` or detect.
- **selector** — CSS selector for the target element. Defaults to the frame root.
- **Guard:** `<cmd>** — optional shell command that must exit 0 each iteration.
- **Iterations:** `N` — iteration cap. Default 5.
- **--evals** — enable mid-loop eval checkpoints.
- **--chain** `<targets>` — comma-separated commands to hand off to on completion.

## 2. Setup (if config missing)

If `.pixel-perfect/pixel-perfect.json` is missing OR the user said "re-detect":

```
node $BIN/detect.mjs <projectDir>   → parse stdout into config
```

If `config.framework` is null OR `impl_url`/`selector` cannot be resolved, use
**AskUserQuestion** to collect the dev URL and selector, then re-run `detect.mjs`.
For a richer guided setup, defer to `/pixel-perfect:plan`.

## 3. Precondition Checks

- Run Preflight from SKILL.md (bootstrap, Figma MCP, git status).
- Confirm the cwd is a git repo (`git rev-parse --is-inside-work-tree`). If not, ask the user.
- If the working tree is dirty, warn and ask whether to proceed (uncommitted work will
  complicate auto-revert).
- Figma token: `fetch-figma.mjs` reads `$FIGMA_TOKEN` → `~/.claude/pixel-perfect/.figma-token`
  → legacy `$BIN/.figma-token`. If it exits `10` (NO_TOKEN), STOP and prompt the user for a
  `figd_...` PAT (figma.com/settings → Security → Personal access tokens, scope
  `file_content:read`), cache it with `mkdir -p ~/.claude/pixel-perfect && umask 077 &&
  printf '%s\n' 'figd_...' > ~/.claude/pixel-perfect/.figma-token`, then warn it is now in
  the transcript.

## 4. Establish Baseline (iteration 0)

```
RUN=.pixel-perfect/runs/<timestamp>-<frame-slug>   (mkdir -p)

a. node $BIN/fetch-figma.mjs --file <fileKey> --node <nodeId> --out $RUN/design.png --scale 1
   → exit 10: prompt for PAT (see §3).  exit 20: report API error, ask about nodeId/access.
b. mcp__claude_ai_Figma__get_design_context   → keep tokens/structure in context
c. mcp__claude_ai_Figma__get_metadata         → extract text-node bboxes for masks
d. If design.png width > figma_frame_width, crop with sharp.extract to frame_width×frame_height.
e. target_viewport_width = figma_frame_width
f. node $BIN/capture.mjs --url <impl_url> --selector <selector> --width <target_viewport_width> --out $RUN/iter0-impl.png
g. node $BIN/diff.mjs --design $RUN/design.png --impl $RUN/iter0-impl.png --out $RUN/iter0 --threshold <config threshold> --masks <bbox-json> --iteration 0
   → parse stdout report. This is baseline_mismatch.
h. node $BIN/results.mjs append --project <projectDir> --iteration 0 --mismatch <pct> --status baseline
```

If baseline mismatch > 50%, STOP — viewport/scroll/content almost certainly differ.
Ask the user to confirm both sides show the same view before iterating.

## 5. Iteration Loop (1..Iterations)

For each iteration `i`, run these phases in order:

1. **Review** — read recent `git log --oneline -5` and `node $BIN/results.mjs tail --project <projectDir>`
   as memory. Do not repeat an edit that a prior row shows already regressed.
2. **Capture** — `node $BIN/capture.mjs --url <impl_url> --selector <selector> --width <target_viewport_width> --out $RUN/iter<i>-impl.png`.
3. **Diff** — `node $BIN/diff.mjs --design $RUN/design.png --impl $RUN/iter<i>-impl.png --out $RUN/iter<i> --threshold <config threshold> --masks <bbox-json> --iteration <i>`. Parse stdout → `report`.
4. **Analyze + Fix** — if `report.result.mismatch_pct >= 2.0`: inspect `$RUN/iter<i>/diff.png`,
   identify the top region(s) of concern, and edit the component source.
   For `i >= 3`, dispatch a `general-purpose` subagent with design.png, iter<i>-impl.png,
   diff.png, report.json, and the component source; ask for a precise edit list and apply it.
   If `mismatch_pct < 2.0`: skip to Summary (§7) — success.
5. **Commit** — `git add -A && git commit -m "pixel-perfect iter<i>: <region> (<mismatch>%)"`
   BEFORE re-verifying, so a regression can be reverted to a known-good state.
6. **Verify** — re-capture and re-diff (repeat phases 2–3 against the committed code) →
   `verify_report`.
7. **Guard** — if `Guard:` set, run it. Non-zero exit = failure → treat as regression in Decide.
8. **Decide**:
   - `verify_report.mismatch_pct < previous_mismatch_pct` AND guard passed → **keep** the commit.
   - regressed OR guard failed → `git revert --no-edit HEAD` (or `git reset --hard HEAD~1`
     if the commit is local and unpushed) → **revert**; record the failed hypothesis.
9. **Log** — `node $BIN/results.mjs append --project <projectDir> --iteration <i> --commit <sha> --mismatch <pct> --delta <prev-pct> --guard <pass|fail> --status <kept|reverted> --region "<note>"`.
10. **Eval Checkpoint** — if `--evals`, every 2 iterations summarize the trend to the user
    (mismatch trajectory, regions still failing) and continue unless they intervene.

Update `previous_mismatch_pct` to the kept value before the next iteration.

## 6. Saturation Detection

Bail and go to Summary if any holds:

- `mismatch_pct < 2.0` → **success**.
- Iteration cap reached.
- Mismatch failed to decrease for 2 consecutive iterations (`stuck >= 2`).
- Mismatch oscillates (up-down-up) over 3 iterations without converging.
- Per-iteration delta < 0.2% for 3 consecutive iterations (diminishing returns).

On any bail-without-success, present the last 3 reports + diff.png path and ask a concrete
multi-choice question:
(a) apply my best hypothesis and re-run · (b) mask `<stuck region>` and accept ·
(c) you inspect diff.png and guide me · (d) abort, restore last good state.
Then defer to `/pixel-perfect:debug` if the user wants deeper diagnosis. Do not iterate
further without user input.

## 7. Summary

Print the report card:

```
Pixel-perfect: <frame name> (<width>px)
  Iteration <n>/<cap> — <mismatch>% mismatch <✓ PASS | ✗ FAIL>

  Top regions of concern:
    • <pct>% — <note> (bbox x,y → x+w,y+h)

  Trend: <baseline>% → … → <final>%   (logged to .pixel-perfect/results.tsv)
  Artifacts: $RUN/   (design.png · impl.png · diff.png · report.json)
```

On success, wait for the user's confirmation ("looks good" / "ship it" / approves PR),
then `node $BIN/cleanup.mjs <projectDir>` (deletes `runs/*`, keeps `pixel-perfect.json`).

## 8. Chain Handoff

If `--chain <targets>` was set, write `.pixel-perfect/handoff.json` via the handoff module
**before** invoking the next command:

```
node $BIN/handoff.mjs write --project <projectDir> \
  --source pixel-perfect \
  --status <COMPLETE|BOUNDED|SATURATED|ERROR|USER_INTERRUPT> \
  --frame "<name>" --mismatch <final-pct> --iterations <n> \
  --findings '<JSON array of {type,region,description,delta,commit}>' \
  --config '<JSON snapshot of {figma_url,impl_url,guard,masks}>'
```

`--status` maps from the loop outcome: success → `COMPLETE`, iteration cap →
`BOUNDED`, stuck/oscillation/diminishing-returns bail → `SATURATED`, crash → `ERROR`,
user abort → `USER_INTERRUPT`. The module records `version`, `timestamp`,
`results_tsv`, and `artifacts` paths automatically (see the schema in `handoff.mjs`).

Then parse `<targets>` (comma-separated) and invoke each in order. Each chained command
reads the handoff with `node $BIN/handoff.mjs read --project <projectDir>` and uses:

- **findings** — to seed its work (e.g. focus regions, root causes).
- **config** — to stay consistent (same figma_url, impl_url, guard, masks).
- **status** — to decide whether to proceed (a downstream `ship` should refuse on a
  non-`COMPLETE` status).

A chained command verifies freshness first with
`node $BIN/handoff.mjs check --project <projectDir>` (exit 0 if < 1h old). After the
whole chain finishes, clear it with `node $BIN/handoff.mjs clear --project <projectDir>`.

Common chains:
- `--chain evals,ship` — pixel-perfect writes `COMPLETE` + findings → evals reads
  `results_tsv` and writes its own handoff with a recommendation → ship reads it and,
  if `COMPLETE`, proceeds with PR creation.
- `--chain regression` — stability gate after a pass.
- `--chain debug` — after a bail; debug writes findings (root causes) for a follow-up run.

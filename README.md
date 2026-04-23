# clau-pix-per

[![Visits](https://hits.sh/github.com/vishalmishraa22/clau-pix-per.svg?style=flat-square&label=visits&color=6f42c1)](https://hits.sh/github.com/vishalmishraa22/clau-pix-per/)
[![Stars](https://img.shields.io/github/stars/vishalmishraa22/clau-pix-per?style=flat-square&logo=github)](https://github.com/vishalmishraa22/clau-pix-per/stargazers)
[![Forks](https://img.shields.io/github/forks/vishalmishraa22/clau-pix-per?style=flat-square&logo=github)](https://github.com/vishalmishraa22/clau-pix-per/network/members)
[![Issues](https://img.shields.io/github/issues/vishalmishraa22/clau-pix-per?style=flat-square)](https://github.com/vishalmishraa22/clau-pix-per/issues)
[![License](https://img.shields.io/github/license/vishalmishraa22/clau-pix-per?style=flat-square)](LICENSE)
[![Last commit](https://img.shields.io/github/last-commit/vishalmishraa22/clau-pix-per?style=flat-square)](https://github.com/vishalmishraa22/clau-pix-per/commits/main)

> Pixel-perfect Figma-to-browser visual diff — a Claude Code plugin.

An iterative diff loop that compares your running UI against a Figma frame and drives the implementation to **under 2% pixel mismatch**. Uses the Figma REST API for the design, Playwright for the browser, [sharp](https://sharp.pixelplumbing.com/) to normalize, [pngjs](https://www.npmjs.com/package/pngjs) to decode, and [pixelmatch](https://www.npmjs.com/package/pixelmatch) for the diff itself. Bails out with a concrete multi-choice question if it gets stuck — never spins forever.

## Install — step by step

Total time: ~3 minutes, one-time per machine.

### Step 1 — Install the Figma MCP server (prerequisite)

This plugin needs the Figma MCP server to read design context and text bounding boxes. If you already have it, skip to Step 2.

Follow Figma's guide: <https://help.figma.com/hc/en-us/articles/32132100833559-Guide-to-the-Figma-MCP-server>

Verify it's registered by running this **in your terminal**:

```bash
cat ~/.claude/mcp_servers.json | grep -i figma
```

You should see a figma entry. If not, the plugin will fail its preflight and tell you to install it.

### Step 2 — Add the marketplace (inside Claude Code)

Open Claude Code, then in the Claude Code prompt type:

```
/plugin marketplace add vishalmishraa22/clau-pix-per
```

### Step 3 — Install the plugin (inside Claude Code)

Still in the Claude Code prompt:

```
/plugin install pixel-perfect@clau-pix-per
/reload-plugins
```

At this point the plugin is registered but Node dependencies are not installed yet. That happens automatically on first use.

### Step 4 — Get a Figma Personal Access Token

1. Open <https://www.figma.com/settings> in your browser
2. Go to **Security** → **Personal access tokens**
3. Click **Generate new token**
4. Scope: **`file_content:read`** (read-only; the skill never writes to your Figma files)
5. Copy the token — it starts with `figd_`

### Step 5 — Save the token (in your terminal)

Run this **in your terminal** (not inside Claude Code). Replace `figd_xxx_paste_your_token_here` with the token you just copied:

```bash
mkdir -p ~/.claude/pixel-perfect && umask 077 && printf '%s\n' 'figd_xxx_paste_your_token_here' > ~/.claude/pixel-perfect/.figma-token
```

What this does:
- `mkdir -p ~/.claude/pixel-perfect` — creates the config directory (ok if it already exists)
- `umask 077` — ensures the token file is only readable by you (mode 600)
- `printf '%s\n' '…'` — writes the token to the file
- `~/.claude/pixel-perfect/.figma-token` — the stable location the plugin reads from (survives plugin updates and cache wipes)

Verify it saved correctly:

```bash
ls -la ~/.claude/pixel-perfect/.figma-token
# should show: -rw------- (mode 600) and non-zero size
```

### Step 6 — First real use

Back in Claude Code, paste any Figma frame URL with a prompt like:

```
Match this to localhost:3000 → https://www.figma.com/design/ABC.../MyFile?node-id=1-23
```

On this first run only, you'll see:

```
[pixel-perfect bootstrap] installing dependencies into .../skills/pixel-perfect (one-time, ~60-90s)...
  added 16 packages
[pixel-perfect bootstrap] downloading Playwright Chromium (~200 MB, ~30-60s)...
[pixel-perfect bootstrap] done. Dependencies ready.
```

Then the iterative diff loop runs. Every subsequent run has zero setup overhead — just the diff.

### Quick troubleshooting

| Symptom | Fix |
|---|---|
| Preflight says "Figma MCP server required" | Re-do Step 1, then restart Claude Code |
| `fetch-figma.mjs` exits with `NO_TOKEN` | Re-do Step 5, make sure the file ends with `.figma-token` (leading dot) |
| `npm install` fails in bootstrap | Check `node --version` — must be >= 20. Run `nvm install 20` or `brew upgrade node` |
| Chromium download fails | Re-run bootstrap manually: `cd ~/.claude/plugins/cache/*/clau-pix-per/*/skills/pixel-perfect && npx playwright install chromium` |

## Prerequisites

| | Required? | Why |
|---|---|---|
| Claude Code >= current | yes | plugin system |
| Node.js >= 20 | yes | bootstrap uses Node APIs that landed in 20 |
| Figma MCP server | **yes** | provides `get_design_context`, `get_metadata`, `get_variable_defs` — needed for text-region auto-masking (the thing that makes <2% achievable) |
| Playwright MCP server | no | **this skill does NOT use the Playwright MCP.** It ships its own Playwright Node library via `bootstrap.mjs`. Install Playwright MCP only if other workflows need it. |
| Figma Personal Access Token | yes | scope `file_content:read`, paste on first run |

Get the Figma MCP: https://help.figma.com/hc/en-us/articles/32132100833559-Guide-to-the-Figma-MCP-server

## How it works

1. You paste a Figma frame URL + "match this against localhost:3000"
2. Skill extracts `fileKey` + `nodeId` from the URL
3. `fetch-figma.mjs` pulls the frame as PNG via Figma REST API → `design.png`
4. `capture.mjs` takes a Playwright screenshot of your running UI → `impl.png`
5. `diff.mjs` normalizes both with sharp, decodes with pngjs, diffs with pixelmatch → `diff.png` + `report.json`
6. If mismatch >= 2%, Claude inspects the diff, edits your CSS/JSX, re-runs
7. After 2 iterations, dispatches a subagent for a clean-context second pass
8. Caps at 5 iterations total. If it can't converge, stops and asks you what to do — never silently retries forever

## Artifacts

The skill creates a `.pixel-perfect/` folder in your project (auto-added to `.gitignore`):

```
<your-project>/.pixel-perfect/
├── pixel-perfect.json         # cached URL, selector, viewport, thresholds
└── runs/<timestamp>-<frame>/
    ├── design.png             # from Figma
    ├── impl.png               # from Playwright
    ├── diff.png               # red = failing pixels, blue = masked regions
    └── report.json            # mismatch %, regions of concern, masks applied
```

When you tell Claude "looks good" / "ship it" / "done", it runs `cleanup.mjs` and wipes `runs/*`. A `SessionEnd` hook also purges stale runs older than 24h as a safety net.

## Figma PAT

The token lookup order (first match wins):

1. `$FIGMA_TOKEN` environment variable
2. `~/.claude/pixel-perfect/.figma-token` (stable user path, chmod 600)
3. `<plugin_dir>/bin/.figma-token` (legacy fallback)

The stable path survives plugin updates and `rm -rf ~/.claude/plugins/cache` (a troubleshooting step Claude Code docs sometimes suggest).

To rotate: generate a new token at https://www.figma.com/settings and overwrite the file with `mkdir -p ~/.claude/pixel-perfect && umask 077 && printf '%s\n' 'figd_...' > ~/.claude/pixel-perfect/.figma-token`.

## What makes <2% achievable

Text rendering alone (font hinting, subpixel AA) gives 3–8% raw noise on most UIs. The skill neutralizes this before diffing:

- **Text regions** — auto-extracted from Figma MCP `get_metadata`, passed as masks, compared with a separate loose threshold + ΔE2000 color check
- **Scrollbar** — auto-masked (16px right column)
- **Carets + focus rings** — hidden at Playwright capture time
- **Animations** — `* { animation: none !important; transition: none !important }` injected
- **Dynamic content** — user-declared selectors in `.pixel-perfect/pixel-perfect.json` (`[data-dynamic]`, `.avatar`, `time`, etc.)

All masks are visible in the diff.png (blue overlay) so you can see what was ignored.

## Bail-out discipline

The skill never spins silently. After every iteration:

- Hard cap: 5 iterations → stop
- No progress: mismatch % didn't decrease vs. previous iteration, twice in a row → stop
- Oscillation: 3.1 → 2.4 → 3.0 → 2.6 → 3.1 → stop

On stop, Claude presents the last 3 reports and a concrete multi-choice question:
```
(a) apply my best hypothesis and re-run
(b) mask <stuck region> and accept current state
(c) you inspect diff.png and guide me
(d) abort, restore last good state
```

## Troubleshooting

| Symptom | Fix |
|---|---|
| "Figma PAT not found" (exit 10) | Generate one at figma.com/settings, paste when prompted |
| "The Figma MCP server is required" | Install Figma MCP, configure in `~/.claude/mcp_servers.json`, restart |
| Mismatch stuck at 3-5%, diff is noisy | Likely font AA. See `reference/troubleshooting.md` inside the skill |
| `npm install` fails in bootstrap | Run `cd ~/.claude/plugins/cache/.../pixel-perfect/skills/pixel-perfect && npm install` manually to see the error |
| Chromium download fails | Run `cd ~/.claude/plugins/cache/.../pixel-perfect/skills/pixel-perfect && npx playwright install chromium` manually |

## Development

```bash
git clone https://github.com/vishalmishraa22/clau-pix-per.git
cd clau-pix-per/skills/pixel-perfect
npm install
npx playwright install chromium
node --test tests/*.test.mjs   # 25 tests, all should pass
```

## License

MIT — see [LICENSE](LICENSE).

## Links

- Source: https://github.com/vishalmishraa22/clau-pix-per
- Claude Code plugin docs: https://code.claude.com/docs/en/discover-plugins
- Figma REST API: https://developers.figma.com/docs/rest-api/
- Figma MCP: https://help.figma.com/hc/en-us/articles/32132100833559-Guide-to-the-Figma-MCP-server

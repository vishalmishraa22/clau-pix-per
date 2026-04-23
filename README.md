# clau-pix-per

> Pixel-perfect Figma-to-browser visual diff — a Claude Code plugin.

An iterative diff loop that compares your running UI against a Figma frame and drives the implementation to **under 2% pixel mismatch**. Uses the Figma REST API for the design, Playwright for the browser, [sharp](https://sharp.pixelplumbing.com/) to normalize, [pngjs](https://www.npmjs.com/package/pngjs) to decode, and [pixelmatch](https://www.npmjs.com/package/pixelmatch) for the diff itself. Bails out with a concrete multi-choice question if it gets stuck — never spins forever.

## Install

Paste a Figma URL into Claude Code and say "match this to localhost:3000". That's the whole UX. The skill is shipped as a single Claude Code plugin, no manual setup.

### One-time setup per machine

```
/plugin marketplace add vishalmishraa22/clau-pix-per
/plugin install pixel-perfect@clau-pix-per
/reload-plugins
```

### On first real use, the skill auto-bootstraps

- ~60–90s to install `node_modules` + Playwright Chromium (once, ever)
- ~30s to paste a Figma Personal Access Token (once, per machine)

Both happen inline in the transcript. Subsequent runs have zero overhead.

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

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const DAY_MS = 24 * 60 * 60 * 1000;
const STATE_DIR = path.join(os.tmpdir(), 'pixel-perfect-hooks');

// A hook is enabled unless its env var is explicitly set to a falsy string.
// Var name: PP_HOOK_<UPPER_SNAKE> (e.g. iteration-context -> PP_HOOK_ITERATION_CONTEXT).
function isEnabled(hookName) {
  const key = 'PP_HOOK_' + String(hookName).toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  const val = process.env[key];
  if (val == null) return true;
  return !/^(0|false|off|no)$/i.test(val.trim());
}

// Read all of stdin synchronously and JSON-parse it. Never throws.
function safeParseStdin() {
  let raw = '';
  try {
    raw = fs.readFileSync(0, 'utf8');
  } catch {
    return {};
  }
  if (!raw || !raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function sessionKey(stdin) {
  return String(stdin.session_id || stdin.sessionId || 'default').replace(/[^A-Za-z0-9._-]/g, '_');
}

function statePath(stdin) {
  return path.join(STATE_DIR, sessionKey(stdin) + '.json');
}

function loadSessionState(stdin) {
  try {
    const raw = fs.readFileSync(statePath(stdin), 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function saveSessionState(stdin, state) {
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.writeFileSync(statePath(stdin), JSON.stringify(state), 'utf8');
  } catch {
    /* best-effort */
  }
}

function cwdFromStdin(stdin) {
  return stdin.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
}

// Walk up from cwd looking for a .pixel-perfect/results.tsv, then fall back to a
// shallow scan of immediate subdirectories. Returns the freshest match within
// maxAgeDays, or null.
function findRecentTsv(cwd, maxAgeDays = 7) {
  const maxAgeMs = maxAgeDays * DAY_MS;
  const now = Date.now();
  const candidates = [];

  let dir = cwd;
  for (let i = 0; i < 6 && dir; i++) {
    candidates.push(path.join(dir, '.pixel-perfect', 'results.tsv'));
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  let best = null;
  let bestMtime = -Infinity;
  for (const p of candidates) {
    try {
      const s = fs.statSync(p);
      if (now - s.mtimeMs > maxAgeMs) continue;
      if (s.mtimeMs > bestMtime) {
        bestMtime = s.mtimeMs;
        best = p;
      }
    } catch {
      /* missing */
    }
  }
  return best;
}

const TSV_COLUMNS = [
  'iteration', 'timestamp', 'commit', 'mismatch', 'delta',
  'guard', 'status', 'region', 'description',
];

// Parse a results.tsv into { meta, rows } mirroring results.mjs semantics.
function parseTsv(raw) {
  const meta = {};
  const rows = [];
  if (!raw) return { meta, rows };
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    if (line.startsWith('#')) {
      const m = line.slice(1).match(/^\s*([^:]+):\s*(.*)$/);
      if (m) meta[m[1].trim()] = m[2].trim();
      continue;
    }
    const fields = line.split('\t');
    if (fields[0] === TSV_COLUMNS[0]) continue;
    const row = {};
    TSV_COLUMNS.forEach((col, i) => { row[col] = fields[i] != null ? fields[i] : ''; });
    rows.push(row);
  }
  return { meta, rows };
}

// Read the last n data rows (and the meta header) of a TSV. Never throws.
function readTsvTail(tsvPath, n = 3) {
  let raw;
  try {
    raw = fs.readFileSync(tsvPath, 'utf8');
  } catch {
    return { meta: {}, rows: [] };
  }
  const { meta, rows } = parseTsv(raw);
  return { meta, rows: rows.slice(-n) };
}

// Emit context to inject into the model's turn. UserPromptSubmit and
// SessionStart support additionalContext via JSON on stdout.
function inject(text) {
  if (!text) return;
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { additionalContext: String(text) },
  }));
}

// Append a JSONL log line under the hook state dir. Best-effort, never throws.
function log(hookName, data) {
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    const entry = JSON.stringify({ ts: new Date().toISOString(), hook: hookName, ...data }) + '\n';
    fs.appendFileSync(path.join(STATE_DIR, 'hooks.log'), entry, 'utf8');
  } catch {
    /* best-effort */
  }
}

// Run a hook body with fail-open semantics: any thrown error exits 0.
function runHook(hookName, fn) {
  if (!isEnabled(hookName)) {
    process.exit(0);
  }
  try {
    const stdin = safeParseStdin();
    fn(stdin);
  } catch (err) {
    try { log(hookName, { error: String(err && err.message || err) }); } catch { /* noop */ }
  }
  process.exit(0);
}

module.exports = {
  DAY_MS,
  STATE_DIR,
  TSV_COLUMNS,
  isEnabled,
  safeParseStdin,
  loadSessionState,
  saveSessionState,
  cwdFromStdin,
  findRecentTsv,
  parseTsv,
  readTsvTail,
  inject,
  log,
  runHook,
};

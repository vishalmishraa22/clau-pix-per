#!/usr/bin/env node
'use strict';

// SessionEnd: remove .pixel-perfect/runs/ entries older than 24h so transient
// screenshot/diff artifacts don't accumulate. Concurrent-session-safe: only
// stale entries are touched, never the live config or results.tsv.

const fs = require('node:fs');
const path = require('node:path');
const {
  runHook, cwdFromStdin, DAY_MS, log,
} = require('./lib/hook-utils.cjs');

runHook('session-cleanup', (stdin) => {
  const cwd = cwdFromStdin(stdin);
  const runsDir = path.join(cwd, '.pixel-perfect', 'runs');

  let entries;
  try {
    entries = fs.readdirSync(runsDir);
  } catch {
    return; // nothing to clean
  }

  const now = Date.now();
  const removed = [];
  for (const entry of entries) {
    const runPath = path.join(runsDir, entry);
    try {
      const s = fs.statSync(runPath);
      if (now - s.mtimeMs > DAY_MS) {
        fs.rmSync(runPath, { recursive: true, force: true });
        removed.push(entry);
      }
    } catch {
      /* gone mid-iteration; ignore */
    }
  }

  log('session-cleanup', { runsDir, removed, count: removed.length });
});

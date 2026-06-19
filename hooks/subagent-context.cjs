#!/usr/bin/env node
'use strict';

// SubagentStart: hand a spawned subagent just enough state to act on the
// pixel-perfect loop — frame name, current iteration, and the latest mismatch.
// Only fires when a loop is actually active (a fresh-enough results.tsv exists).

const {
  runHook, cwdFromStdin, findRecentTsv, readTsvTail, inject, log,
} = require('./lib/hook-utils.cjs');

runHook('subagent-context', (stdin) => {
  const cwd = cwdFromStdin(stdin);
  const tsv = findRecentTsv(cwd, 7);
  if (!tsv) return; // loop not active

  const { meta, rows } = readTsvTail(tsv, 1);
  if (rows.length === 0) return;

  const last = rows[0];
  const lines = [];
  lines.push('## pixel-perfect context');
  lines.push(`Frame: ${meta.frame || 'unknown'}`);
  lines.push(`Current iteration: ${last.iteration}`);
  lines.push(`Current mismatch: ${last.mismatch}% (delta ${last.delta})`);
  if (last.region && last.region !== '-') lines.push(`Affected region: ${last.region}`);
  lines.push(`Target: <2% mismatch.`);

  inject(lines.join('\n'));
  log('subagent-context', { injected: true, iteration: last.iteration, mismatch: last.mismatch });
});

#!/usr/bin/env node
'use strict';

// UserPromptSubmit: inject the recent pixel-perfect TSV state so the model
// stays oriented across a long iterative loop. Throttled to every 3rd prompt
// to avoid flooding context.

const {
  runHook, cwdFromStdin, findRecentTsv, readTsvTail,
  loadSessionState, saveSessionState, inject, log,
} = require('./lib/hook-utils.cjs');

const THROTTLE = 3;

runHook('iteration-context', (stdin) => {
  const cwd = cwdFromStdin(stdin);
  const tsv = findRecentTsv(cwd, 7);
  if (!tsv) return; // no active loop

  const state = loadSessionState(stdin);
  const count = (state.promptCount || 0) + 1;
  state.promptCount = count;
  saveSessionState(stdin, state);

  // Inject on the 1st prompt and then every THROTTLE-th.
  if (count !== 1 && count % THROTTLE !== 0) return;

  const { meta, rows } = readTsvTail(tsv, 3);
  if (rows.length === 0) return;

  const current = Number(rows[rows.length - 1].iteration);
  const lines = [];
  lines.push('## pixel-perfect loop state');
  if (meta.frame) lines.push(`Frame: ${meta.frame}`);
  lines.push(`Current iteration: ${Number.isFinite(current) ? current : '?'}`);
  lines.push('');
  lines.push('Recent iterations (iteration | mismatch% | delta | guard | status | description):');
  for (const r of rows) {
    lines.push(`- ${r.iteration} | ${r.mismatch} | ${r.delta} | ${r.guard} | ${r.status} | ${r.description}`);
  }

  inject(lines.join('\n'));
  log('iteration-context', { injected: true, iteration: current, promptCount: count });
});

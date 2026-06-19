#!/usr/bin/env node
'use strict';

// SessionEnd / Stop: notify when a pixel-perfect run reached its target.
// Emits an OSC 777 desktop notification to the controlling terminal, and
// optionally POSTs to $PP_NOTIFY_WEBHOOK if set.

const fs = require('node:fs');
const {
  runHook, cwdFromStdin, findRecentTsv, readTsvTail, log,
} = require('./lib/hook-utils.cjs');

const TARGET_PCT = 2.0;

function osc777(title, body) {
  // OSC 777 ; notify ; <title> ; <body> ST  — understood by tmux/wezterm/kitty/iterm.
  const seq = `]777;notify;${title};${body}`;
  try {
    fs.writeFileSync('/dev/tty', seq);
  } catch {
    try { process.stderr.write(seq); } catch { /* noop */ }
  }
}

function postWebhook(url, payload) {
  // Fire-and-forget; never block session teardown. Available on Node >=18.
  if (typeof fetch !== 'function') return;
  try {
    fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => {});
  } catch {
    /* noop */
  }
}

runHook('completion-notify', (stdin) => {
  const cwd = cwdFromStdin(stdin);
  const tsv = findRecentTsv(cwd, 7);
  if (!tsv) return;

  const { meta, rows } = readTsvTail(tsv, 1);
  if (rows.length === 0) return;

  const last = rows[0];
  const mismatch = Number(last.mismatch);
  if (!Number.isFinite(mismatch)) return;

  const frame = meta.frame || 'frame';
  const done = mismatch < TARGET_PCT;
  const title = done ? 'pixel-perfect: target reached' : 'pixel-perfect: session ended';
  const body = `${frame} at ${last.mismatch}% (iter ${last.iteration})`;

  osc777(title, body);

  const webhook = process.env.PP_NOTIFY_WEBHOOK;
  if (webhook && webhook.trim()) {
    postWebhook(webhook.trim(), {
      frame,
      iteration: last.iteration,
      mismatch,
      target_reached: done,
      status: last.status,
    });
  }

  log('completion-notify', { frame, mismatch, target_reached: done, webhook: !!webhook });
});

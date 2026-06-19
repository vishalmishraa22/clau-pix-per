#!/usr/bin/env node
'use strict';

// SessionStart: confirm a Figma personal access token is reachable so the user
// isn't surprised mid-loop. Resolution order mirrors fetch-figma.mjs:
//   1. $FIGMA_TOKEN
//   2. ~/.claude/pixel-perfect/.figma-token
// This is advisory only: it injects a warning but always exits 0 (fail-open),
// since plenty of sessions never touch Figma.

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {
  runHook, inject, log,
} = require('./lib/hook-utils.cjs');

const STABLE_TOKEN_PATH = path.join(os.homedir(), '.claude', 'pixel-perfect', '.figma-token');

function firstLine(p) {
  try {
    const raw = fs.readFileSync(p, 'utf8');
    return raw.split('\n').map(s => s.trim()).find(s => s.length > 0) || null;
  } catch {
    return null;
  }
}

// Figma PATs look like figd_<base64ish>. Older tokens lack the prefix, so this
// is a soft sanity check, not a hard reject.
function looksValid(token) {
  return typeof token === 'string' && token.length >= 20;
}

runHook('figma-token-check', (stdin) => {
  let token = null;
  let source = null;

  if (process.env.FIGMA_TOKEN && process.env.FIGMA_TOKEN.trim()) {
    token = process.env.FIGMA_TOKEN.trim();
    source = 'env';
  } else {
    const line = firstLine(STABLE_TOKEN_PATH);
    if (line) {
      token = line;
      source = 'file';
    }
  }

  if (!token) {
    inject(
      'Note: no Figma token found. The pixel-perfect skill needs a Figma personal access token to fetch designs. ' +
      'Set $FIGMA_TOKEN or write it to ~/.claude/pixel-perfect/.figma-token before running a Figma comparison.'
    );
    log('figma-token-check', { found: false });
    return;
  }

  if (!looksValid(token)) {
    inject(
      'Note: a Figma token was found but it looks malformed (too short). ' +
      'If Figma fetches fail with an auth error, re-check the token at ~/.claude/pixel-perfect/.figma-token or $FIGMA_TOKEN.'
    );
    log('figma-token-check', { found: true, source, suspect: true });
    return;
  }

  log('figma-token-check', { found: true, source });
});

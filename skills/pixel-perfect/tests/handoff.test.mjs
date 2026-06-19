import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  writeHandoff, readHandoff, hasRecentHandoff, clearHandoff,
} from '../bin/handoff.mjs';

async function tmp() {
  return mkdtemp(join(tmpdir(), 'pp-handoff-'));
}

test('readHandoff returns null when missing', async () => {
  const dir = await tmp();
  try {
    assert.equal(await readHandoff(dir), null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('writeHandoff then readHandoff round-trips with schema fields', async () => {
  const dir = await tmp();
  try {
    const findings = [{ type: 'fix', region: 'button', description: 'padding', delta: -4.3, commit: 'b2c3d4e' }];
    await writeHandoff(dir, {
      source: 'pixel-perfect',
      status: 'COMPLETE',
      frame: 'LoginCard',
      finalMismatch: 1.8,
      iterations: 5,
      findings,
      config: { figma_url: 'https://x', impl_url: 'http://localhost:3000' },
    });
    const h = await readHandoff(dir);
    assert.equal(h.version, '2.0.0');
    assert.equal(h.source, 'pixel-perfect');
    assert.equal(h.status, 'COMPLETE');
    assert.equal(h.verdict, null);
    assert.equal(h.frame, 'LoginCard');
    assert.equal(h.final_mismatch, 1.8);
    assert.equal(h.iterations, 5);
    assert.deepEqual(h.findings, findings);
    assert.equal(h.config.impl_url, 'http://localhost:3000');
    assert.equal(h.results_tsv, '.pixel-perfect/results.tsv');
    assert.ok(h.artifacts.diff.endsWith('diff.png'));
    assert.ok(h.timestamp);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('writeHandoff creates .pixel-perfect dir if missing', async () => {
  const dir = await tmp();
  try {
    await writeHandoff(dir, { source: 'debug', status: 'COMPLETE' });
    const h = await readHandoff(dir);
    assert.equal(h.source, 'debug');
    assert.deepEqual(h.findings, []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('hasRecentHandoff false when missing, true when fresh', async () => {
  const dir = await tmp();
  try {
    assert.equal(await hasRecentHandoff(dir), false);
    await writeHandoff(dir, { source: 'evals', status: 'COMPLETE' });
    assert.equal(await hasRecentHandoff(dir), true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('hasRecentHandoff false when older than 1 hour', async () => {
  const dir = await tmp();
  try {
    await writeHandoff(dir, { source: 'evals', status: 'COMPLETE' });
    const old = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await utimes(join(dir, '.pixel-perfect', 'handoff.json'), old, old);
    assert.equal(await hasRecentHandoff(dir), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('clearHandoff removes file and returns false when absent', async () => {
  const dir = await tmp();
  try {
    assert.equal(await clearHandoff(dir), false);
    await writeHandoff(dir, { source: 'ship', status: 'COMPLETE' });
    assert.equal(await clearHandoff(dir), true);
    assert.equal(await readHandoff(dir), null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

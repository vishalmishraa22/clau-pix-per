import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, saveConfig, defaultConfig } from '../bin/lib/config.mjs';

test('loadConfig returns defaults when file missing', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pp-'));
  try {
    const cfg = await loadConfig(dir);
    assert.equal(cfg.thresholds.global_max_mismatch_pct, 2.0);
    assert.equal(cfg.thresholds.pixelmatch_threshold, 0.1);
    assert.deepEqual(cfg.masks.selectors, ['[data-dynamic]']);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('saveConfig then loadConfig round-trips', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pp-'));
  try {
    const input = { ...defaultConfig(), impl_url: 'http://localhost:4000', selector: '#root' };
    await saveConfig(dir, input);
    const loaded = await loadConfig(dir);
    assert.equal(loaded.impl_url, 'http://localhost:4000');
    assert.equal(loaded.selector, '#root');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('saveConfig creates .pixel-perfect dir if missing', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pp-'));
  try {
    await saveConfig(dir, defaultConfig());
    const raw = await readFile(join(dir, '.pixel-perfect', 'pixel-perfect.json'), 'utf8');
    assert.ok(JSON.parse(raw));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

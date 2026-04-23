import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, utimes, stat, rm, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cleanupProject, cleanupStale } from '../bin/cleanup.mjs';

async function makeRun(projectDir, name, ageMs = 0) {
  const runDir = join(projectDir, '.pixel-perfect', 'runs', name);
  await mkdir(runDir, { recursive: true });
  await writeFile(join(runDir, 'report.json'), '{}');
  if (ageMs > 0) {
    const when = new Date(Date.now() - ageMs);
    await utimes(runDir, when, when);
    await utimes(join(runDir, 'report.json'), when, when);
  }
  return runDir;
}

test('cleanupProject removes runs/* but keeps pixel-perfect.json', async () => {
  const proj = await mkdtemp(join(tmpdir(), 'pp-cu-'));
  await makeRun(proj, 'run1');
  await makeRun(proj, 'run2');
  await writeFile(join(proj, '.pixel-perfect', 'pixel-perfect.json'), '{"version":1}');
  await cleanupProject(proj);
  const runs = await readdir(join(proj, '.pixel-perfect', 'runs')).catch(() => []);
  assert.equal(runs.length, 0);
  assert.ok(existsSync(join(proj, '.pixel-perfect', 'pixel-perfect.json')));
});

test('cleanupStale removes only runs older than 24h', async () => {
  const proj = await mkdtemp(join(tmpdir(), 'pp-cs-'));
  const dayMs = 24 * 60 * 60 * 1000;
  const fresh = await makeRun(proj, 'fresh', 1000);            // 1s old
  const stale = await makeRun(proj, 'stale', dayMs + 60 * 1000); // 24h + 1min old
  await cleanupStale([proj], dayMs);
  assert.ok(existsSync(fresh));
  assert.ok(!existsSync(stale));
});

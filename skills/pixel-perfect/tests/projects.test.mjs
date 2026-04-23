import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { registerProject, listProjects, forgetMissing } from '../bin/lib/projects.mjs';

test('registerProject + listProjects is idempotent', async () => {
  const registryPath = join(await mkdtemp(join(tmpdir(), 'pp-reg-')), 'projects.json');
  const projA = await mkdtemp(join(tmpdir(), 'pp-pa-'));
  await registerProject(registryPath, projA);
  await registerProject(registryPath, projA);
  const list = await listProjects(registryPath);
  assert.equal(list.length, 1);
  assert.equal(list[0], projA);
});

test('forgetMissing drops deleted project dirs', async () => {
  const registryPath = join(await mkdtemp(join(tmpdir(), 'pp-reg-')), 'projects.json');
  const projA = await mkdtemp(join(tmpdir(), 'pp-pa-'));
  const projB = await mkdtemp(join(tmpdir(), 'pp-pb-'));
  await registerProject(registryPath, projA);
  await registerProject(registryPath, projB);
  await rm(projB, { recursive: true });
  await forgetMissing(registryPath);
  const list = await listProjects(registryPath);
  assert.deepEqual(list, [projA]);
});

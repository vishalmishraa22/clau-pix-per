import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectFramework, ensureGitignore, bootstrap } from '../bin/detect.mjs';

async function makeNextProject(dir) {
  await writeFile(join(dir, 'package.json'), JSON.stringify({
    name: 'x', scripts: { dev: 'next dev -p 3001' }, dependencies: { next: '14.0.0' },
  }));
  await writeFile(join(dir, 'next.config.js'), 'module.exports = {};');
}

async function makeViteProject(dir) {
  await writeFile(join(dir, 'package.json'), JSON.stringify({
    name: 'x', scripts: { dev: 'vite' }, devDependencies: { vite: '5.0.0' },
  }));
  await writeFile(join(dir, 'vite.config.js'), 'export default {};');
}

test('detectFramework identifies Next.js and port', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pp-det-'));
  await makeNextProject(dir);
  const info = await detectFramework(dir);
  assert.equal(info.framework, 'next');
  assert.equal(info.dev_port, 3001);
  assert.equal(info.dev_command, 'next dev -p 3001');
});

test('detectFramework identifies Vite with default port 5173', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pp-det-'));
  await makeViteProject(dir);
  const info = await detectFramework(dir);
  assert.equal(info.framework, 'vite');
  assert.equal(info.dev_port, 5173);
});

test('detectFramework returns null framework when unknown', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pp-det-'));
  await writeFile(join(dir, 'package.json'), '{"name":"x"}');
  const info = await detectFramework(dir);
  assert.equal(info.framework, null);
});

test('ensureGitignore adds entry idempotently', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pp-gi-'));
  await ensureGitignore(dir);
  await ensureGitignore(dir);
  const raw = await readFile(join(dir, '.gitignore'), 'utf8');
  const matches = raw.match(/\.pixel-perfect\//g) || [];
  assert.equal(matches.length, 1);
});

test('ensureGitignore preserves existing entries', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pp-gi-'));
  await writeFile(join(dir, '.gitignore'), 'node_modules/\n');
  await ensureGitignore(dir);
  const raw = await readFile(join(dir, '.gitignore'), 'utf8');
  assert.ok(raw.includes('node_modules/'));
  assert.ok(raw.includes('.pixel-perfect/'));
});

test('bootstrap creates .pixel-perfect/ and writes config', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pp-bs-'));
  await makeViteProject(dir);
  const cfg = await bootstrap(dir);
  assert.equal(cfg.framework, 'vite');
  const saved = JSON.parse(await readFile(join(dir, '.pixel-perfect', 'pixel-perfect.json'), 'utf8'));
  assert.equal(saved.framework, 'vite');
  const gi = await readFile(join(dir, '.gitignore'), 'utf8');
  assert.ok(gi.includes('.pixel-perfect/'));
});

test('bootstrap records graphify presence when graphify-out exists', async () => {
  const { detectGraphify } = await import('../bin/detect.mjs');
  const dir = await mkdtemp(join(tmpdir(), 'pp-gx-'));
  await makeViteProject(dir);
  await mkdir(join(dir, 'graphify-out', 'wiki'), { recursive: true });
  await writeFile(join(dir, 'graphify-out', 'GRAPH_REPORT.md'), '# Graph Report\n');
  await writeFile(join(dir, 'graphify-out', 'wiki', 'index.md'), '# Wiki\n');
  const gx = await detectGraphify(dir);
  assert.equal(gx.present, true);
  assert.ok(gx.graph_report.endsWith('GRAPH_REPORT.md'));
  assert.ok(gx.wiki_index.endsWith('index.md'));
  const cfg = await bootstrap(dir);
  assert.equal(cfg.graphify.present, true);
});

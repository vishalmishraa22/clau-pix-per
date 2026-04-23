#!/usr/bin/env node
import { readFile, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { Command } from 'commander';
import { loadConfig, saveConfig, defaultConfig } from './lib/config.mjs';
import { registerProject } from './lib/projects.mjs';

const REGISTRY_PATH = join(homedir(), '.claude', 'skills', 'pixel-perfect', '.projects.json');

const FRAMEWORK_DEFAULT_PORTS = {
  next: 3000, vite: 5173, remix: 3000, astro: 4321, storybook: 6006,
  nuxt: 3000, sveltekit: 5173,
};

function parsePortFromCommand(cmd) {
  const m = cmd && cmd.match(/-p\s+(\d+)|--port[=\s]+(\d+)/);
  if (m) return Number(m[1] || m[2]);
  return null;
}

async function fileExists(path) {
  try { await access(path); return true; } catch { return false; }
}

export async function detectGraphify(projectDir) {
  const graphReport = join(projectDir, 'graphify-out', 'GRAPH_REPORT.md');
  const wikiIndex = join(projectDir, 'graphify-out', 'wiki', 'index.md');
  return {
    present: await fileExists(graphReport),
    graph_report: (await fileExists(graphReport)) ? graphReport : null,
    wiki_index: (await fileExists(wikiIndex)) ? wikiIndex : null,
  };
}

export async function detectFramework(projectDir) {
  const info = {
    framework: null, dev_command: null, dev_port: null, impl_url: null, confidence: 'low',
  };
  let pkg;
  try {
    pkg = JSON.parse(await readFile(join(projectDir, 'package.json'), 'utf8'));
  } catch { return info; }

  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  const devScript = pkg.scripts?.dev || pkg.scripts?.start || null;

  if (deps.next || await fileExists(join(projectDir, 'next.config.js')) ||
      await fileExists(join(projectDir, 'next.config.ts')) ||
      await fileExists(join(projectDir, 'next.config.mjs'))) {
    info.framework = 'next';
  } else if (deps.vite || await fileExists(join(projectDir, 'vite.config.js')) ||
             await fileExists(join(projectDir, 'vite.config.ts'))) {
    info.framework = 'vite';
  } else if (deps['@remix-run/dev'] || await fileExists(join(projectDir, 'remix.config.js'))) {
    info.framework = 'remix';
  } else if (deps.astro || await fileExists(join(projectDir, 'astro.config.mjs'))) {
    info.framework = 'astro';
  } else if (deps.nuxt || await fileExists(join(projectDir, 'nuxt.config.ts'))) {
    info.framework = 'nuxt';
  } else if (deps['@sveltejs/kit'] || await fileExists(join(projectDir, 'svelte.config.js'))) {
    info.framework = 'sveltekit';
  } else if (await fileExists(join(projectDir, '.storybook'))) {
    info.framework = 'storybook';
  }

  if (info.framework) {
    info.dev_command = devScript || `${info.framework} dev`;
    info.dev_port = parsePortFromCommand(info.dev_command) || FRAMEWORK_DEFAULT_PORTS[info.framework];
    info.impl_url = `http://localhost:${info.dev_port}`;
    info.confidence = devScript ? 'high' : 'medium';
  }
  return info;
}

export async function ensureGitignore(projectDir) {
  const giPath = join(projectDir, '.gitignore');
  let existing = '';
  try { existing = await readFile(giPath, 'utf8'); } catch {}
  if (/^\.pixel-perfect\/\s*$/m.test(existing)) return;
  const sep = existing.endsWith('\n') || existing === '' ? '' : '\n';
  await writeFile(giPath, existing + sep + '.pixel-perfect/\n', 'utf8');
}

export async function bootstrap(projectDir) {
  const existing = await loadConfig(projectDir);
  const detected = await detectFramework(projectDir);
  const graphify = await detectGraphify(projectDir);
  const merged = {
    ...defaultConfig(),
    ...existing,
    framework: existing.framework ?? detected.framework,
    dev_command: existing.dev_command ?? detected.dev_command,
    dev_port: existing.dev_port ?? detected.dev_port,
    impl_url: existing.impl_url ?? detected.impl_url,
    graphify,
  };
  await saveConfig(projectDir, merged);
  await ensureGitignore(projectDir);
  await registerProject(REGISTRY_PATH, projectDir);
  return merged;
}

async function main() {
  const program = new Command();
  program
    .argument('[projectDir]', 'Project directory', process.cwd())
    .option('--force', 'Re-run detection even if config exists');
  program.parse(process.argv);
  const projectDir = program.args[0] || process.cwd();
  const cfg = await bootstrap(projectDir);
  console.log(JSON.stringify(cfg, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => { console.error(err); process.exit(1); });
}

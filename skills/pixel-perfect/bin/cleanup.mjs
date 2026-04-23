#!/usr/bin/env node
import { readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { Command } from 'commander';
import { listProjects, forgetMissing } from './lib/projects.mjs';

const REGISTRY_PATH = join(homedir(), '.claude', 'skills', 'pixel-perfect', '.projects.json');
const DAY_MS = 24 * 60 * 60 * 1000;

export async function cleanupProject(projectDir) {
  const runsDir = join(projectDir, '.pixel-perfect', 'runs');
  try {
    const entries = await readdir(runsDir);
    for (const entry of entries) {
      await rm(join(runsDir, entry), { recursive: true, force: true });
    }
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
}

export async function cleanupStale(projectDirs, maxAgeMs = DAY_MS) {
  const now = Date.now();
  let removed = 0;
  for (const projectDir of projectDirs) {
    const runsDir = join(projectDir, '.pixel-perfect', 'runs');
    let entries;
    try { entries = await readdir(runsDir); } catch { continue; }
    for (const entry of entries) {
      const runPath = join(runsDir, entry);
      try {
        const s = await stat(runPath);
        if (now - s.mtimeMs > maxAgeMs) {
          await rm(runPath, { recursive: true, force: true });
          removed++;
        }
      } catch { /* gone mid-iteration */ }
    }
  }
  return removed;
}

async function main() {
  const program = new Command();
  program
    .argument('[projectDir]', 'Project directory to clean', process.cwd())
    .option('--stale-only', 'Only remove runs older than 24h')
    .option('--all-projects', 'Apply to every registered project')
    .option('--max-age-hours <n>', 'Override stale age threshold', '24');
  program.parse(process.argv);
  const opts = program.opts();
  const maxAgeMs = Number(opts.maxAgeHours) * 60 * 60 * 1000;

  let targets;
  if (opts.allProjects) {
    await forgetMissing(REGISTRY_PATH);
    targets = await listProjects(REGISTRY_PATH);
  } else {
    targets = [program.args[0] || process.cwd()];
  }

  if (opts.staleOnly) {
    const n = await cleanupStale(targets, maxAgeMs);
    console.log(`pixel-perfect cleanup: removed ${n} stale run(s) across ${targets.length} project(s)`);
  } else {
    for (const t of targets) await cleanupProject(t);
    console.log(`pixel-perfect cleanup: purged runs for ${targets.length} project(s)`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => { console.error(err); process.exit(1); });
}

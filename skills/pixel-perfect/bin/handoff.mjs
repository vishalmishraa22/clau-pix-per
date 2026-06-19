#!/usr/bin/env node
import { mkdir, readFile, writeFile, unlink, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { Command } from 'commander';

const HANDOFF_VERSION = '2.0.0';
const RECENT_MS = 60 * 60 * 1000; // 1 hour

function handoffPath(projectDir) {
  return join(projectDir, '.pixel-perfect', 'handoff.json');
}

export async function writeHandoff(projectDir, {
  source,
  status,
  verdict = null,
  frame = null,
  finalMismatch = null,
  iterations = null,
  findings = [],
  config = {},
} = {}) {
  const handoff = {
    version: HANDOFF_VERSION,
    source,
    timestamp: new Date().toISOString(),
    status,
    verdict,
    frame,
    final_mismatch: finalMismatch,
    iterations,
    findings,
    config,
    results_tsv: '.pixel-perfect/results.tsv',
    artifacts: {
      design: '.pixel-perfect/runs/latest/design.png',
      impl: '.pixel-perfect/runs/latest/impl.png',
      diff: '.pixel-perfect/runs/latest/diff.png',
    },
  };
  await mkdir(join(projectDir, '.pixel-perfect'), { recursive: true });
  await writeFile(handoffPath(projectDir), JSON.stringify(handoff, null, 2) + '\n', 'utf8');
  return handoff;
}

export async function readHandoff(projectDir) {
  try {
    const raw = await readFile(handoffPath(projectDir), 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

export async function hasRecentHandoff(projectDir) {
  try {
    const info = await stat(handoffPath(projectDir));
    return Date.now() - info.mtimeMs < RECENT_MS;
  } catch (err) {
    if (err.code === 'ENOENT') return false;
    throw err;
  }
}

export async function clearHandoff(projectDir) {
  try {
    await unlink(handoffPath(projectDir));
    return true;
  } catch (err) {
    if (err.code === 'ENOENT') return false;
    throw err;
  }
}

async function main() {
  const program = new Command();

  program
    .command('write')
    .requiredOption('--project <dir>', 'Project directory')
    .requiredOption('--source <name>', 'Source command name')
    .requiredOption('--status <state>', 'COMPLETE | BOUNDED | SATURATED | ERROR | USER_INTERRUPT')
    .option('--verdict <v>', 'STABLE | UNSTABLE | DRIFT')
    .option('--frame <name>', 'Frame name')
    .option('--mismatch <pct>', 'Final mismatch percentage')
    .option('--iterations <n>', 'Total iterations run')
    .option('--findings <json>', 'Findings array as JSON string')
    .option('--config <json>', 'Config snapshot as JSON string')
    .action(async (opts) => {
      const handoff = await writeHandoff(opts.project, {
        source: opts.source,
        status: opts.status,
        verdict: opts.verdict ?? null,
        frame: opts.frame ?? null,
        finalMismatch: opts.mismatch == null ? null : Number(opts.mismatch),
        iterations: opts.iterations == null ? null : Number(opts.iterations),
        findings: opts.findings ? JSON.parse(opts.findings) : [],
        config: opts.config ? JSON.parse(opts.config) : {},
      });
      console.log(JSON.stringify(handoff, null, 2));
    });

  program
    .command('read')
    .requiredOption('--project <dir>', 'Project directory')
    .action(async (opts) => {
      const handoff = await readHandoff(opts.project);
      console.log(JSON.stringify(handoff, null, 2));
    });

  program
    .command('check')
    .requiredOption('--project <dir>', 'Project directory')
    .action(async (opts) => {
      const recent = await hasRecentHandoff(opts.project);
      console.log(JSON.stringify({ recent }));
      process.exit(recent ? 0 : 1);
    });

  program
    .command('clear')
    .requiredOption('--project <dir>', 'Project directory')
    .action(async (opts) => {
      const cleared = await clearHandoff(opts.project);
      console.log(JSON.stringify({ cleared }));
    });

  await program.parseAsync(process.argv);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => { console.error(err); process.exit(1); });
}

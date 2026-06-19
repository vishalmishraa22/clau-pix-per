#!/usr/bin/env node
import { mkdir, readFile, writeFile, appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Command } from 'commander';

const COLUMNS = [
  'iteration', 'timestamp', 'commit', 'mismatch', 'delta',
  'guard', 'status', 'region', 'description',
];

function tsvPath(projectDir) {
  return join(projectDir, '.pixel-perfect', 'results.tsv');
}

async function readRaw(projectDir) {
  try {
    return await readFile(tsvPath(projectDir), 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

function parse(raw) {
  const meta = {};
  const rows = [];
  if (!raw) return { meta, rows };
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    if (line.startsWith('#')) {
      const m = line.slice(1).match(/^\s*([^:]+):\s*(.*)$/);
      if (m) meta[m[1].trim()] = m[2].trim();
      continue;
    }
    const fields = line.split('\t');
    if (fields[0] === COLUMNS[0]) continue; // header row
    const row = {};
    COLUMNS.forEach((col, i) => { row[col] = fields[i] ?? ''; });
    rows.push(row);
  }
  return { meta, rows };
}

export async function initResults(projectDir, { frame, figmaUrl }) {
  const path = tsvPath(projectDir);
  const existing = await readRaw(projectDir);
  if (existing !== null) {
    return { path, created: false, ...parse(existing).meta };
  }
  await mkdir(join(projectDir, '.pixel-perfect'), { recursive: true });
  const header =
    `# metric_direction: lower_is_better\n` +
    `# frame: ${frame ?? '-'}\n` +
    `# figma_url: ${figmaUrl ?? '-'}\n` +
    COLUMNS.join('\t') + '\n';
  await writeFile(path, header, 'utf8');
  return { path, created: true, frame, figma_url: figmaUrl };
}

export async function getCurrentIteration(projectDir) {
  const { rows } = parse(await readRaw(projectDir));
  if (rows.length === 0) return -1;
  return rows.reduce((max, r) => Math.max(max, Number(r.iteration)), -1);
}

export async function calculateDelta(projectDir, currentMismatch) {
  const { rows } = parse(await readRaw(projectDir));
  if (rows.length === 0) return 0;
  const prev = Number(rows[rows.length - 1].mismatch);
  return Math.round((Number(currentMismatch) - prev) * 10) / 10;
}

export async function logIteration(projectDir, {
  iteration, commit, mismatch, delta, guard, status, region, description,
}) {
  if (iteration == null) iteration = (await getCurrentIteration(projectDir)) + 1;
  if (delta == null && mismatch != null) {
    delta = await calculateDelta(projectDir, mismatch);
  }
  const row = {
    iteration: String(iteration),
    timestamp: new Date().toISOString(),
    commit: commit ?? '-',
    mismatch: mismatch ?? '-',
    delta: delta ?? '0.0',
    guard: guard ?? 'pass',
    status: status ?? 'keep',
    region: region ?? '-',
    description: description ?? '-',
  };
  const line = COLUMNS.map(c => String(row[c]).replace(/[\t\n]/g, ' ')).join('\t') + '\n';
  await appendFile(tsvPath(projectDir), line, 'utf8');
  return row;
}

export async function readRecentResults(projectDir, n = 5) {
  const { rows } = parse(await readRaw(projectDir));
  return rows.slice(-n);
}

async function main() {
  const program = new Command();

  program
    .command('init')
    .requiredOption('--project <dir>', 'Project directory')
    .requiredOption('--frame <name>', 'Frame name')
    .option('--figma-url <url>', 'Figma design URL', '-')
    .action(async (opts) => {
      const res = await initResults(opts.project, { frame: opts.frame, figmaUrl: opts.figmaUrl });
      console.log(JSON.stringify(res));
    });

  program
    .command('log')
    .requiredOption('--project <dir>', 'Project directory')
    .option('--iteration <n>', 'Iteration number (auto if omitted)')
    .option('--commit <sha>', 'Git commit SHA', '-')
    .option('--mismatch <pct>', 'Mismatch percentage')
    .option('--delta <n>', 'Delta from previous (auto if omitted)')
    .option('--guard <state>', 'pass | fail | skip', 'pass')
    .option('--status <state>', 'baseline | keep | discard | crash | guard-fail | stuck', 'keep')
    .option('--region <name>', 'Affected region', '-')
    .option('--description <text>', 'One-line description', '-')
    .action(async (opts) => {
      const row = await logIteration(opts.project, {
        iteration: opts.iteration == null ? null : Number(opts.iteration),
        commit: opts.commit,
        mismatch: opts.mismatch == null ? null : Number(opts.mismatch),
        delta: opts.delta == null ? null : Number(opts.delta),
        guard: opts.guard,
        status: opts.status,
        region: opts.region,
        description: opts.description,
      });
      console.log(JSON.stringify(row));
    });

  program
    .command('read')
    .requiredOption('--project <dir>', 'Project directory')
    .option('--last <n>', 'Number of recent rows', '5')
    .action(async (opts) => {
      const rows = await readRecentResults(opts.project, Number(opts.last));
      console.log(JSON.stringify(rows, null, 2));
    });

  await program.parseAsync(process.argv);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => { console.error(err); process.exit(1); });
}

#!/usr/bin/env node
// Git commit/revert operations for the pixel-perfect iteration loop.
// Every change is committed before verification and auto-reverted on regression.
//
// Usage:
//   node bin/git-ops.mjs status  --project .
//   node bin/git-ops.mjs commit  --project . --iteration 3 --description "fix button padding" --frame "Hero"
//   node bin/git-ops.mjs revert  --project .
//   node bin/git-ops.mjs history --project . --last 10
//   node bin/git-ops.mjs diff    --project .

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Command } from 'commander';

const execFileAsync = promisify(execFile);

const COMMIT_PREFIX = 'experiment: pixel-perfect';
const LOG_SEP = '\x1f'; // unit separator — safe inside commit subjects
const LOG_REC = '\x1e'; // record separator between commits

const EXIT_NOT_REPO = 11;
const EXIT_DIRTY = 12;
const EXIT_GIT_FAIL = 13;
const EXIT_ARGS = 30;

function log(op, detail) {
  process.stderr.write(`[git-ops] ${op}${detail ? ' — ' + detail : ''}\n`);
}

async function git(projectDir, args) {
  // execFile (not exec) — args passed as an array, never shell-interpolated.
  const { stdout } = await execFileAsync('git', args, {
    cwd: projectDir,
    maxBuffer: 64 * 1024 * 1024,
  });
  return stdout;
}

async function isGitRepo(projectDir) {
  try {
    const out = await git(projectDir, ['rev-parse', '--is-inside-work-tree']);
    return out.trim() === 'true';
  } catch {
    return false;
  }
}

export async function checkGitStatus(projectDir) {
  const isRepo = await isGitRepo(projectDir);
  if (!isRepo) {
    return { isRepo: false, isClean: false, branch: null, uncommittedFiles: [] };
  }

  let branch = null;
  try {
    branch = (await git(projectDir, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim();
  } catch {
    branch = null; // unborn branch (no commits yet)
  }

  const porcelain = await git(projectDir, ['status', '--porcelain']);
  const uncommittedFiles = porcelain
    .split('\n')
    .map(l => l.trimEnd())
    .filter(Boolean)
    .map(l => ({ status: l.slice(0, 2).trim(), path: l.slice(3) }));

  return {
    isRepo: true,
    isClean: uncommittedFiles.length === 0,
    branch,
    uncommittedFiles,
  };
}

export async function commitExperiment(projectDir, { iteration, description, frame } = {}) {
  const status = await checkGitStatus(projectDir);
  if (!status.isRepo) {
    return { success: false, sha: null, message: 'not a git repository' };
  }
  if (status.isClean) {
    log('commit', 'nothing to commit, working tree clean');
    return { success: false, sha: null, message: 'nothing to commit, working tree clean' };
  }

  const frameSuffix = frame ? ` (${frame})` : '';
  const message = `${COMMIT_PREFIX} iter${iteration} — ${description}${frameSuffix}`;

  try {
    await git(projectDir, ['add', '-A']);
    await git(projectDir, ['commit', '-m', message]);
    const sha = (await git(projectDir, ['rev-parse', 'HEAD'])).trim();
    log('commit', `${sha.slice(0, 8)} ${message}`);
    return { success: true, sha, message };
  } catch (err) {
    log('commit', `failed: ${err.message}`);
    return { success: false, sha: null, message: String(err.message || err) };
  }
}

export async function revertLast(projectDir) {
  if (!(await isGitRepo(projectDir))) {
    return { success: false, revertedSha: null };
  }
  let revertedSha = null;
  try {
    revertedSha = (await git(projectDir, ['rev-parse', 'HEAD'])).trim();
    await git(projectDir, ['revert', 'HEAD', '--no-edit']);
    log('revert', `reverted ${revertedSha.slice(0, 8)}`);
    return { success: true, revertedSha };
  } catch (err) {
    log('revert', `failed: ${err.message}`);
    return { success: false, revertedSha };
  }
}

export async function getExperimentHistory(projectDir, n = 10) {
  if (!(await isGitRepo(projectDir))) return [];
  const format = ['%H', '%s', '%cI'].join(LOG_SEP) + LOG_REC;
  let out;
  try {
    out = await git(projectDir, [
      'log',
      `--grep=^${COMMIT_PREFIX}`,
      `--max-count=${n}`,
      `--format=${format}`,
    ]);
  } catch {
    return [];
  }
  return out
    .split(LOG_REC)
    .map(r => r.replace(/^\n+/, ''))
    .filter(Boolean)
    .map(rec => {
      const [sha, message, date] = rec.split(LOG_SEP);
      const m = message && message.match(/—\s*(.*)$/);
      const description = m ? m[1].trim() : (message || '').trim();
      return { sha, message, date, description };
    });
}

export async function commitExists(projectDir, sha) {
  if (!sha || !(await isGitRepo(projectDir))) return false;
  try {
    // ^{commit} ensures the object is a commit, not just any existing object.
    await git(projectDir, ['cat-file', '-e', `${sha}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}

export async function getLastDiff(projectDir) {
  if (!(await isGitRepo(projectDir))) {
    return { files: [], additions: 0, deletions: 0, diff: '' };
  }
  let hasParent = true;
  try {
    await git(projectDir, ['rev-parse', 'HEAD~1']);
  } catch {
    hasParent = false; // first commit in repo
  }
  const range = hasParent ? ['HEAD~1', 'HEAD'] : ['HEAD'];
  const diffArgs = hasParent ? ['diff', ...range] : ['show', 'HEAD'];

  let numstat, diff;
  try {
    numstat = hasParent
      ? await git(projectDir, ['diff', '--numstat', ...range])
      : await git(projectDir, ['show', '--numstat', '--format=', 'HEAD']);
    diff = await git(projectDir, diffArgs);
  } catch (err) {
    log('diff', `failed: ${err.message}`);
    return { files: [], additions: 0, deletions: 0, diff: '' };
  }

  let additions = 0;
  let deletions = 0;
  const files = [];
  for (const line of numstat.split('\n').filter(Boolean)) {
    const [add, del, file] = line.split('\t');
    const a = add === '-' ? 0 : Number(add) || 0;
    const d = del === '-' ? 0 : Number(del) || 0;
    additions += a;
    deletions += d;
    files.push({ file, additions: a, deletions: d });
  }

  return { files, additions, deletions, diff };
}

async function main() {
  const program = new Command();
  program
    .name('git-ops')
    .description('Git commit/revert operations for the pixel-perfect iteration loop');

  program
    .command('status')
    .requiredOption('--project <dir>', 'Project directory')
    .action(async (opts) => {
      const res = await checkGitStatus(opts.project);
      console.log(JSON.stringify(res, null, 2));
      if (!res.isRepo) process.exit(EXIT_NOT_REPO);
    });

  program
    .command('commit')
    .requiredOption('--project <dir>', 'Project directory')
    .requiredOption('--iteration <n>', 'Iteration number')
    .requiredOption('--description <text>', 'One-line description of the change')
    .option('--frame <name>', 'Frame name for context')
    .action(async (opts) => {
      const pre = await checkGitStatus(opts.project);
      if (!pre.isRepo) {
        console.error(JSON.stringify({ success: false, message: 'not a git repository' }, null, 2));
        process.exit(EXIT_NOT_REPO);
      }
      if (pre.isClean) {
        log('commit', 'warning: working tree is clean, nothing to commit');
      }
      const res = await commitExperiment(opts.project, {
        iteration: opts.iteration,
        description: opts.description,
        frame: opts.frame,
      });
      console.log(JSON.stringify(res, null, 2));
      if (!res.success) process.exit(EXIT_GIT_FAIL);
    });

  program
    .command('revert')
    .requiredOption('--project <dir>', 'Project directory')
    .action(async (opts) => {
      const res = await revertLast(opts.project);
      console.log(JSON.stringify(res, null, 2));
      if (!res.success) process.exit(EXIT_GIT_FAIL);
    });

  program
    .command('history')
    .requiredOption('--project <dir>', 'Project directory')
    .option('--last <n>', 'Number of commits', '10')
    .action(async (opts) => {
      const res = await getExperimentHistory(opts.project, Number(opts.last));
      console.log(JSON.stringify(res, null, 2));
    });

  program
    .command('diff')
    .requiredOption('--project <dir>', 'Project directory')
    .action(async (opts) => {
      const res = await getLastDiff(opts.project);
      console.log(JSON.stringify(res, null, 2));
    });

  await program.parseAsync(process.argv);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error(JSON.stringify({ error: 'GIT_OPS_FAIL', message: String(err.message || err) }, null, 2));
    process.exit(EXIT_GIT_FAIL);
  });
}

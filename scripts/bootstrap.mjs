#!/usr/bin/env node
// One-time bootstrap for the pixel-perfect skill.
// Invoked by SKILL.md on first run, inside the plugin cache directory.
//
// Idempotent: if skills/pixel-perfect/node_modules/ exists AND
// skills/pixel-perfect/.bootstrap-done matches package.json mtime, exits 0 immediately.
//
// Otherwise:
//   1. Verifies Node version >= 20
//   2. Runs `npm install` inside skills/pixel-perfect/
//   3. Runs `npx playwright install chromium`
//   4. Writes .bootstrap-done marker
//
// Exit codes:
//   0  success (or already bootstrapped)
//   10 Node version too old
//   20 npm install failed
//   30 playwright install failed

import { existsSync, statSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = join(__dirname, "..", "skills", "pixel-perfect");
const MARKER = join(SKILL_DIR, ".bootstrap-done");
const PKG = join(SKILL_DIR, "package.json");
const NODE_MODULES = join(SKILL_DIR, "node_modules");

function log(msg) { console.log(`[pixel-perfect bootstrap] ${msg}`); }
function err(msg) { console.error(`[pixel-perfect bootstrap] ${msg}`); }

function checkNode() {
  const major = Number(process.versions.node.split(".")[0]);
  if (major < 20) {
    err(`Node ${process.versions.node} detected; need >= 20. Upgrade with: brew upgrade node (macOS) or nvm install 20`);
    process.exit(10);
  }
}

function alreadyBootstrapped() {
  if (!existsSync(NODE_MODULES) || !existsSync(MARKER)) return false;
  try {
    const markerMtime = statSync(MARKER).mtimeMs;
    const pkgMtime = statSync(PKG).mtimeMs;
    // If package.json changed since last bootstrap, re-run
    return markerMtime >= pkgMtime;
  } catch {
    return false;
  }
}

function run(cmd, args, cwd) {
  log(`$ ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, { cwd, stdio: "inherit", env: process.env });
  return r.status ?? 1;
}

async function writeMarker() {
  await writeFile(MARKER, `bootstrapped at ${new Date().toISOString()}\n`, "utf8");
}

async function main() {
  checkNode();

  if (alreadyBootstrapped()) {
    log("already bootstrapped; nothing to do");
    process.exit(0);
  }

  log(`installing dependencies into ${SKILL_DIR} (one-time, ~60-90s)...`);
  let code = run("npm", ["install", "--no-audit", "--no-fund"], SKILL_DIR);
  if (code !== 0) {
    err("npm install failed. See error above. Common causes: no internet, npm not in PATH, insufficient permissions.");
    process.exit(20);
  }

  log("downloading Playwright Chromium (~200 MB, ~30-60s)...");
  code = run("npx", ["playwright", "install", "chromium"], SKILL_DIR);
  if (code !== 0) {
    err("playwright chromium install failed. Check network. You can retry: cd " + SKILL_DIR + " && npx playwright install chromium");
    process.exit(30);
  }

  await writeMarker();
  log("done. Dependencies ready.");
}

main().catch((e) => {
  err(`unexpected error: ${e.message || e}`);
  process.exit(1);
});

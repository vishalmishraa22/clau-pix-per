#!/usr/bin/env node
// Fetches a Figma frame as PNG via REST API.
// Reads token from (in order): $FIGMA_TOKEN env var, then ~/.claude/skills/pixel-perfect/bin/.figma-token.
// If neither exists, prints a clear error and exits 10 so the caller knows to prompt the user.
//
// Usage:
//   node fetch-figma.mjs --file <fileKey> --node <nodeId> --out <path> [--scale 1]
//
// Example:
//   node fetch-figma.mjs --file gMlVW92OTpgGmZoVKOb9vt --node 7952:103693 \
//     --out .pixel-perfect/runs/foo/design.png --scale 1

import { writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { mkdir } from "node:fs/promises";

// Stable user-home path for the Figma PAT. Survives plugin updates and cache wipes.
const STABLE_TOKEN_PATH = join(homedir(), ".claude", "pixel-perfect", ".figma-token");

const EXIT_NO_TOKEN = 10;
const EXIT_API = 20;
const EXIT_ARGS = 30;

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    if (k.startsWith("--")) {
      out[k.slice(2)] = argv[i + 1];
      i++;
    }
  }
  return out;
}

async function readFirstLine(path) {
  try {
    const raw = await readFile(path, "utf8");
    const line = raw.split("\n").map(s => s.trim()).find(s => s.length > 0);
    return line || null;
  } catch {
    return null;
  }
}

async function readToken() {
  // 1. $FIGMA_TOKEN env var (CI and power users)
  if (process.env.FIGMA_TOKEN && process.env.FIGMA_TOKEN.trim()) {
    return process.env.FIGMA_TOKEN.trim();
  }
  // 2. ~/.claude/pixel-perfect/.figma-token — stable user path, primary home
  if (existsSync(STABLE_TOKEN_PATH)) {
    const line = await readFirstLine(STABLE_TOKEN_PATH);
    if (line) return line;
  }
  // 3. Legacy in-plugin-dir path (pre-migration, read-only fallback)
  const legacyTokenFile = new URL(".figma-token", import.meta.url);
  if (existsSync(legacyTokenFile)) {
    const line = await readFirstLine(legacyTokenFile);
    if (line) return line;
  }
  return null;
}

async function fetchFramePng({ token, fileKey, nodeId, scale }) {
  const url = `https://api.figma.com/v1/images/${fileKey}?ids=${encodeURIComponent(nodeId)}&format=png&scale=${scale}`;
  const res = await fetch(url, { headers: { "X-Figma-Token": token } });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Figma API ${res.status}: ${body}`);
  }
  const json = await res.json();
  if (json.err) throw new Error(`Figma API error: ${json.err}`);
  const signed = json.images?.[nodeId];
  if (!signed) throw new Error(`No image URL returned for node ${nodeId}. API response: ${JSON.stringify(json)}`);
  const imgRes = await fetch(signed);
  if (!imgRes.ok) throw new Error(`Signed URL fetch failed: ${imgRes.status}`);
  return Buffer.from(await imgRes.arrayBuffer());
}

async function main() {
  const args = parseArgs(process.argv);
  const { file, node, out } = args;
  const scale = args.scale || "1";
  if (!file || !node || !out) {
    console.error("usage: fetch-figma.mjs --file <fileKey> --node <nodeId> --out <path> [--scale 1]");
    process.exit(EXIT_ARGS);
  }
  const token = await readToken();
  if (!token) {
    console.error(JSON.stringify({
      error: "NO_TOKEN",
      message: `Figma PAT not found. Set $FIGMA_TOKEN or write it to ${STABLE_TOKEN_PATH}`,
      stable_token_path: STABLE_TOKEN_PATH,
      how_to_get: "https://www.figma.com/settings → Security → Personal access tokens → Generate new token (scope: file_content:read)",
    }, null, 2));
    process.exit(EXIT_NO_TOKEN);
  }
  try {
    const png = await fetchFramePng({ token, fileKey: file, nodeId: node, scale });
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, png);
    console.log(JSON.stringify({
      ok: true,
      file_key: file,
      node_id: node,
      scale,
      out,
      bytes: png.length,
    }, null, 2));
  } catch (e) {
    console.error(JSON.stringify({ error: "API_FAIL", message: String(e.message || e) }, null, 2));
    process.exit(EXIT_API);
  }
}

main();

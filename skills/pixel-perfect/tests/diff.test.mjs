import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { runDiff } from '../bin/diff.mjs';

async function solidPng(width, height, rgb, outPath) {
  await sharp({
    create: { width, height, channels: 4, background: { r: rgb[0], g: rgb[1], b: rgb[2], alpha: 1 } },
  }).png().toFile(outPath);
}

let dir;
before(async () => { dir = await mkdtemp(join(tmpdir(), 'pp-diff-')); });

test('identical PNGs produce 0% mismatch', async () => {
  const a = join(dir, 'a.png'), b = join(dir, 'b.png');
  await solidPng(50, 50, [120, 120, 120], a);
  await solidPng(50, 50, [120, 120, 120], b);
  const report = await runDiff({
    design: a, impl: b, outDir: join(dir, 'r-ident'), threshold: 0.1, masks: [], maskScrollbar: false,
  });
  assert.equal(report.result.mismatched_pixels, 0);
  assert.equal(report.result.passed, true);
});

test('completely different PNGs produce ~100% mismatch', async () => {
  const a = join(dir, 'ca.png'), b = join(dir, 'cb.png');
  await solidPng(20, 20, [0, 0, 0], a);
  await solidPng(20, 20, [255, 255, 255], b);
  const report = await runDiff({
    design: a, impl: b, outDir: join(dir, 'r-diff'), threshold: 0.1, masks: [], maskScrollbar: false,
  });
  assert.ok(report.result.mismatch_pct > 90);
  assert.equal(report.result.passed, false);
});

test('sharp normalizes mismatched dimensions before diffing', async () => {
  const a = join(dir, 'sa.png'), b = join(dir, 'sb.png');
  await solidPng(100, 100, [50, 50, 50], a);
  await solidPng(200, 200, [50, 50, 50], b);
  const report = await runDiff({
    design: a, impl: b, outDir: join(dir, 'r-norm'), threshold: 0.1, masks: [],
  });
  assert.equal(report.result.mismatched_pixels, 0);
});

test('masked regions are ignored in diff count', async () => {
  const a = join(dir, 'ma.png'), b = join(dir, 'mb.png');
  await solidPng(40, 40, [0, 0, 0], a);
  await sharp({ create: { width: 40, height: 40, channels: 4, background: { r:0,g:0,b:0,alpha:1 }}})
    .composite([{
      input: await sharp({ create: { width: 20, height: 40, channels: 4, background: { r:255,g:255,b:255,alpha:1 }}}).png().toBuffer(),
      left: 20, top: 0,
    }])
    .png().toFile(b);
  const unmasked = await runDiff({ design: a, impl: b, outDir: join(dir, 'r-um'), threshold: 0.1, masks: [], maskScrollbar: false });
  const masked = await runDiff({
    design: a, impl: b, outDir: join(dir, 'r-m'), threshold: 0.1, maskScrollbar: false,
    masks: [{ x: 20, y: 0, w: 20, h: 40 }],
  });
  assert.ok(unmasked.result.mismatch_pct > 40);
  assert.ok(masked.result.mismatch_pct < 1);
});

test('report carries masked_pixels, masked_pct, unmasked basis, and provenance', async () => {
  const a = join(dir, 'pa.png'), b = join(dir, 'pb.png');
  await solidPng(40, 40, [0, 0, 0], a);
  await solidPng(40, 40, [0, 0, 0], b);
  const report = await runDiff({
    design: a, impl: b, outDir: join(dir, 'r-fields'), threshold: 0.1, maskScrollbar: false,
    masks: [{ x: 0, y: 0, w: 10, h: 40, source: 'selector', selector: '.x' }],
  });
  const r = report.result;
  assert.equal(r.total_pixels, 1600);
  assert.equal(r.masked_pixels, 400);
  assert.equal(r.masked_pct, 25);              // 400 / 1600
  assert.equal(r.visible_pixels, 1200);
  assert.equal('mismatch_pct_unmasked_basis' in r, true);
  assert.equal(report.masks_applied, 1);
  assert.deepEqual(report.masks[0], { bbox: [0, 0, 10, 40], pixels: 400, source: 'selector', selector: '.x' });
});

test('GUARDRAIL: over-masking cannot pass even at near-zero mismatch_pct (production bug repro)', async () => {
  // Two images differ across the full frame, but we mask ~60% of it. The
  // surviving difference is small as a fraction of the FULL frame, so the
  // legacy mismatch_pct looks tiny — yet the run must NOT pass.
  const a = join(dir, 'ga.png'), b = join(dir, 'gb.png');
  await solidPng(100, 100, [0, 0, 0], a);
  await solidPng(100, 100, [255, 255, 255], b); // 100% different before masking
  const report = await runDiff({
    design: a, impl: b, outDir: join(dir, 'r-guard'), threshold: 0.1, maskScrollbar: false,
    maxMaskedPct: 15.0,
    // Mask 60 of 100 columns → 60% of the frame.
    masks: [{ x: 0, y: 0, w: 60, h: 100, source: 'manual' }],
  });
  const r = report.result;
  assert.equal(r.masked_pct, 60);
  // Unmasked basis exposes that the visible area is 100% wrong.
  assert.ok(r.mismatch_pct_unmasked_basis > 99, `unmasked basis ${r.mismatch_pct_unmasked_basis}`);
  assert.equal(r.passed, false);
  assert.equal(r.warning, 'excessive_masking');
});

test('GUARDRAIL: low-mismatch run with masking under the cap still passes', async () => {
  const a = join(dir, 'oka.png'), b = join(dir, 'okb.png');
  await solidPng(100, 100, [10, 10, 10], a);
  await solidPng(100, 100, [10, 10, 10], b);
  const report = await runDiff({
    design: a, impl: b, outDir: join(dir, 'r-ok'), threshold: 0.1, maskScrollbar: false,
    maxMaskedPct: 15.0,
    masks: [{ x: 0, y: 0, w: 10, h: 100, source: 'scrollbar' }], // 10% masked, under cap
  });
  assert.equal(report.result.masked_pct, 10);
  assert.equal(report.result.passed, true);
  assert.equal('warning' in report.result, false);
});

test('writes diff.png and report.json to outDir', async () => {
  const a = join(dir, 'wa.png'), b = join(dir, 'wb.png');
  await solidPng(10, 10, [255, 0, 0], a);
  await solidPng(10, 10, [0, 255, 0], b);
  const runDir = join(dir, 'r-write');
  const report = await runDiff({ design: a, impl: b, outDir: runDir, threshold: 0.1, masks: [] });
  assert.ok(report.artifacts.diff.endsWith('diff.png'));
  const diffPng = await readFile(report.artifacts.diff);
  assert.ok(diffPng.length > 0);
  const reportJson = JSON.parse(await readFile(join(runDir, 'report.json'), 'utf8'));
  assert.equal(reportJson.result.mismatched_pixels, report.result.mismatched_pixels);
});

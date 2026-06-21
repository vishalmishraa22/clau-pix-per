#!/usr/bin/env node
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { Command } from 'commander';
import sharp from 'sharp';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { applyMasks, overlayDiff, scrollbarMask, countMaskedPixels, maskProvenance } from './lib/masks.mjs';

async function normalizeToSize(filePath, targetWidth, targetHeight) {
  const resized = await sharp(filePath)
    .resize(targetWidth, targetHeight, { fit: 'fill' })
    .png()
    .toBuffer();
  return new Promise((resolve, reject) => {
    new PNG().parse(resized, (err, data) => err ? reject(err) : resolve(data));
  });
}

async function encodePng(width, height, data, outPath) {
  const png = new PNG({ width, height });
  png.data = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  const buffer = PNG.sync.write(png);
  await writeFile(outPath, buffer);
}

export async function runDiff({
  design, impl, outDir, threshold = 0.1, masks = [],
  maskScrollbar = true, frame = {}, iteration = 1,
  maxMismatchPct = 2.0, maxMaskedPct = 15.0,
}) {
  await mkdir(outDir, { recursive: true });

  const designMeta = await sharp(design).metadata();
  const implMeta = await sharp(impl).metadata();

  const width = Math.min(designMeta.width, implMeta.width);
  const height = Math.min(designMeta.height, implMeta.height);

  const designPng = await normalizeToSize(design, width, height);
  const implPng = await normalizeToSize(impl, width, height);

  const effectiveMasks = [...masks];
  if (maskScrollbar) effectiveMasks.push(scrollbarMask(width, height));

  applyMasks(designPng.data, width, height, effectiveMasks);
  applyMasks(implPng.data, width, height, effectiveMasks);

  const diffBuf = new Uint8ClampedArray(width * height * 4);
  const mismatchedPixels = pixelmatch(
    designPng.data, implPng.data, diffBuf, width, height,
    { threshold, includeAA: false, diffColor: [255, 0, 0] }
  );
  overlayDiff(diffBuf, width, height, effectiveMasks, [0, 120, 255, 180]);

  const diffPath = join(outDir, 'diff.png');
  const designOutPath = join(outDir, 'design.png');
  const implOutPath = join(outDir, 'impl.png');
  await encodePng(width, height, diffBuf, diffPath);
  await copyFile(design, designOutPath);
  await copyFile(impl, implOutPath);

  const totalPixels = width * height;
  const maskedPixels = countMaskedPixels(width, height, effectiveMasks);
  const visiblePixels = Math.max(0, totalPixels - maskedPixels);

  // Full-frame basis: masked pixels never differ (both images are blacked
  // out there) but they STILL inflate the denominator, so over-masking
  // drives this number toward zero. Kept for backward compatibility.
  const mismatchPct = (mismatchedPixels / totalPixels) * 100;
  // Unmasked basis: mismatched pixels over the pixels actually compared.
  // Over-masking cannot hide a high density of differences in the visible
  // area here — this is the honest "how wrong is what we DID compare" number.
  const mismatchPctUnmasked = visiblePixels > 0
    ? (mismatchedPixels / visiblePixels) * 100
    : 0;
  const maskedPct = (maskedPixels / totalPixels) * 100;

  const overMasked = maskedPct > maxMaskedPct;
  // Pass requires BOTH a low mismatch AND that we didn't mask our way there.
  const passed = mismatchPct < maxMismatchPct && !overMasked;

  const result = {
    mismatch_pct: Number(mismatchPct.toFixed(3)),
    mismatch_pct_unmasked_basis: Number(mismatchPctUnmasked.toFixed(3)),
    mismatched_pixels: mismatchedPixels,
    total_pixels: totalPixels,
    masked_pixels: maskedPixels,
    masked_pct: Number(maskedPct.toFixed(3)),
    visible_pixels: visiblePixels,
    passed,
  };
  if (overMasked) {
    result.warning = 'excessive_masking';
    result.warning_detail =
      `masked_pct ${maskedPct.toFixed(1)}% exceeds cap ${maxMaskedPct}% — ` +
      `run fails regardless of mismatch_pct. Masking must be limited to dynamic ` +
      `content (timers/scrollbars/carets) or explicitly-justified design deltas, ` +
      `not static layout.`;
  }

  const report = {
    run_id: basename(outDir),
    iteration,
    frame,
    capture: { width, height },
    thresholds: { max_mismatch_pct: maxMismatchPct, max_masked_pct: maxMaskedPct },
    result,
    masks_applied: effectiveMasks.length,
    masks: maskProvenance(width, height, effectiveMasks),
    artifacts: {
      design: designOutPath,
      impl: implOutPath,
      diff: diffPath,
    },
    duration_ms: null,
  };

  await writeFile(join(outDir, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  return report;
}

async function main() {
  const program = new Command();
  program
    .requiredOption('--design <path>', 'Path to design PNG')
    .requiredOption('--impl <path>', 'Path to implementation PNG')
    .requiredOption('--out <dir>', 'Output directory for diff artifacts')
    .option('--threshold <n>', 'pixelmatch threshold (0-1)', '0.1')
    .option('--masks <json>', 'JSON array of mask rectangles [{x,y,w,h,source?,selector?,note?},...]', '[]')
    .option('--max-mismatch <n>', 'Pass ceiling for mismatch_pct', '2.0')
    .option('--max-masked <n>', 'Guardrail: masked_pct cap above which the run cannot pass', '15.0')
    .option('--no-scrollbar', 'Do not auto-mask the scrollbar column')
    .option('--iteration <n>', 'Iteration number', '1');
  program.parse(process.argv);
  const opts = program.opts();

  const started = Date.now();
  const report = await runDiff({
    design: opts.design,
    impl: opts.impl,
    outDir: opts.out,
    threshold: Number(opts.threshold),
    masks: JSON.parse(opts.masks),
    maskScrollbar: opts.scrollbar !== false,
    maxMismatchPct: Number(opts.maxMismatch),
    maxMaskedPct: Number(opts.maxMasked),
    iteration: Number(opts.iteration),
  });
  report.duration_ms = Date.now() - started;
  const r = report.result;
  const verdict = r.passed ? 'PASS' : 'FAIL';
  let summary = `[diff] iter ${report.iteration}: ${r.mismatch_pct}% mismatch ` +
    `(${r.mismatch_pct_unmasked_basis}% of visible area) · ` +
    `${report.masks_applied} masks, ${r.masked_pct}% masked · ${verdict}`;
  if (r.warning) summary += ` · WARNING: ${r.warning}`;
  console.error(summary);
  console.log(JSON.stringify(report, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => { console.error(err); process.exit(1); });
}

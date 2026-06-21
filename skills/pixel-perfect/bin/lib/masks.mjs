export function applyMasks(buf, width, height, masks) {
  for (const m of masks) {
    const x0 = Math.max(0, Math.floor(m.x));
    const y0 = Math.max(0, Math.floor(m.y));
    const x1 = Math.min(width, Math.floor(m.x + m.w));
    const y1 = Math.min(height, Math.floor(m.y + m.h));
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (y * width + x) * 4;
        buf[i] = 0; buf[i+1] = 0; buf[i+2] = 0; buf[i+3] = 255;
      }
    }
  }
}

export function scrollbarMask(width, height) {
  return { x: width - 16, y: 0, w: 16, h: height, source: 'scrollbar' };
}

export function overlayDiff(diffBuf, width, height, maskRegions, color = [0, 120, 255, 180]) {
  for (const m of maskRegions) {
    const x0 = Math.max(0, Math.floor(m.x));
    const y0 = Math.max(0, Math.floor(m.y));
    const x1 = Math.min(width, Math.floor(m.x + m.w));
    const y1 = Math.min(height, Math.floor(m.y + m.h));
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (y * width + x) * 4;
        diffBuf[i] = color[0]; diffBuf[i+1] = color[1]; diffBuf[i+2] = color[2]; diffBuf[i+3] = color[3];
      }
    }
  }
}

// Count the number of distinct pixels covered by the union of all mask
// rectangles, clamped to the frame. Overlapping masks must NOT be
// double-counted — otherwise masked_pct could exceed 100% and the
// guardrail math would be wrong. We stamp a 1-byte-per-pixel coverage map.
export function countMaskedPixels(width, height, masks) {
  if (!masks || masks.length === 0) return 0;
  const covered = new Uint8Array(width * height);
  for (const m of masks) {
    const x0 = Math.max(0, Math.floor(m.x));
    const y0 = Math.max(0, Math.floor(m.y));
    const x1 = Math.min(width, Math.floor(m.x + m.w));
    const y1 = Math.min(height, Math.floor(m.y + m.h));
    for (let y = y0; y < y1; y++) {
      const row = y * width;
      for (let x = x0; x < x1; x++) covered[row + x] = 1;
    }
  }
  let n = 0;
  for (let i = 0; i < covered.length; i++) n += covered[i];
  return n;
}

// Normalize a mask into a provenance record: clamped integer bbox + a
// source tag so the report itemizes every masked region. Unknown sources
// fall back to 'manual' (a hand-passed rectangle with no declared origin).
export function maskProvenance(width, height, masks) {
  return (masks || []).map((m) => {
    const x0 = Math.max(0, Math.floor(m.x));
    const y0 = Math.max(0, Math.floor(m.y));
    const x1 = Math.min(width, Math.floor(m.x + m.w));
    const y1 = Math.min(height, Math.floor(m.y + m.h));
    const w = Math.max(0, x1 - x0);
    const h = Math.max(0, y1 - y0);
    const rec = {
      bbox: [x0, y0, w, h],
      pixels: w * h,
      source: m.source || 'manual',
    };
    if (m.selector) rec.selector = m.selector;
    if (m.note) rec.note = m.note;
    return rec;
  });
}

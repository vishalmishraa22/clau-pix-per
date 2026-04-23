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
  return { x: width - 16, y: 0, w: 16, h: height };
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

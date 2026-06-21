import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyMasks, countMaskedPixels, maskProvenance, scrollbarMask } from '../bin/lib/masks.mjs';

function makeBuf(width, height, fill = [255, 255, 255, 255]) {
  const buf = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < buf.length; i += 4) {
    buf[i] = fill[0]; buf[i+1] = fill[1]; buf[i+2] = fill[2]; buf[i+3] = fill[3];
  }
  return buf;
}

test('applyMasks blacks out rectangular region', () => {
  const buf = makeBuf(10, 10);
  applyMasks(buf, 10, 10, [{ x: 2, y: 2, w: 3, h: 3 }]);
  const idx = (3 * 10 + 3) * 4;
  assert.equal(buf[idx], 0);
  assert.equal(buf[idx+1], 0);
  assert.equal(buf[idx+2], 0);
  assert.equal(buf[0], 255);
});

test('applyMasks clamps to image bounds', () => {
  const buf = makeBuf(5, 5);
  applyMasks(buf, 5, 5, [{ x: 3, y: 3, w: 10, h: 10 }]);
  const idx = (4 * 5 + 4) * 4;
  assert.equal(buf[idx], 0);
});

test('applyMasks ignores empty mask list', () => {
  const buf = makeBuf(4, 4);
  applyMasks(buf, 4, 4, []);
  assert.equal(buf[0], 255);
});

test('countMaskedPixels sums a single rectangle', () => {
  assert.equal(countMaskedPixels(100, 100, [{ x: 0, y: 0, w: 10, h: 10 }]), 100);
});

test('countMaskedPixels does not double-count overlapping masks', () => {
  // Two 10x10 masks sharing a 5x10 overlap → union = 150, not 200.
  const masks = [
    { x: 0, y: 0, w: 10, h: 10 },
    { x: 5, y: 0, w: 10, h: 10 },
  ];
  assert.equal(countMaskedPixels(100, 100, masks), 150);
});

test('countMaskedPixels clamps to frame bounds', () => {
  assert.equal(countMaskedPixels(10, 10, [{ x: 5, y: 5, w: 100, h: 100 }]), 25);
});

test('countMaskedPixels is 0 for empty list', () => {
  assert.equal(countMaskedPixels(10, 10, []), 0);
});

test('maskProvenance itemizes bbox, pixels, and source', () => {
  const prov = maskProvenance(100, 100, [
    { x: 2, y: 3, w: 4, h: 5, source: 'selector', selector: '.avatar' },
    { x: 0, y: 0, w: 8, h: 8, note: 'team removed banner' },
    scrollbarMask(100, 100),
  ]);
  assert.deepEqual(prov[0], { bbox: [2, 3, 4, 5], pixels: 20, source: 'selector', selector: '.avatar' });
  assert.equal(prov[1].source, 'manual'); // no source → manual
  assert.equal(prov[1].note, 'team removed banner');
  assert.equal(prov[2].source, 'scrollbar');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyMasks } from '../bin/lib/masks.mjs';

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

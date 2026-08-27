import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  int16ToFloat32,
  float32ToInt16,
  computeRms,
  dbFromRms,
} from '../src/core/audio-utils.mjs';

test('int16ToFloat32 比例正確', () => {
  const f = int16ToFloat32(new Int16Array([0, 16384, -16384, 32767, -32768]));
  assert.equal(f[0], 0);
  assert.ok(Math.abs(f[1] - 0.5) < 1e-6);
  assert.ok(Math.abs(f[2] + 0.5) < 1e-6);
  assert.ok(Math.abs(f[3] - 32767 / 32768) < 1e-6);
  assert.equal(f[4], -1);
});

test('float32ToInt16 往返誤差小', () => {
  const src = new Float32Array([0, 0.25, -0.25, 1, -1]);
  const back = int16ToFloat32(float32ToInt16(src));
  for (let i = 0; i < src.length; i++) {
    assert.ok(Math.abs(back[i] - src[i]) < 1e-4, `index ${i}`);
  }
});

test('float32ToInt16 截斷超範圍值', () => {
  const out = float32ToInt16(new Float32Array([2, -2]));
  assert.equal(out[0], 32767);
  assert.equal(out[1], -32768);
});

test('computeRms 已知值', () => {
  const full = computeRms(new Float32Array([1, -1, 1, -1]));
  assert.ok(Math.abs(full - 1) < 1e-6);
  const half = computeRms(new Int16Array([16384, -16384]));
  assert.ok(Math.abs(half - 0.5) < 1e-6);
});

test('computeRms 空輸入回 0', () => {
  assert.equal(computeRms(new Float32Array(0)), 0);
  assert.equal(computeRms(undefined), 0);
  assert.equal(computeRms(null), 0);
});

test('dbFromRms', () => {
  assert.ok(Math.abs(dbFromRms(1)) < 1e-9);
  assert.ok(Math.abs(dbFromRms(0.5) + 6.0206) < 1e-3);
  assert.equal(dbFromRms(0), -Infinity);
});

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeRMS, rmsToPercent } from '../src/core/volume.js'

test('computeRMS 空輸入與全零', () => {
  assert.equal(computeRMS(undefined), 0)
  assert.equal(computeRMS([]), 0)
  assert.equal(computeRMS(new Float32Array(0)), 0)
  assert.equal(computeRMS([0, 0, 0]), 0)
})

test('computeRMS 全幅樣本', () => {
  assert.equal(computeRMS([1, 1, 1, 1]), 1)
  assert.equal(computeRMS([-1, -1, -1, -1]), 1)
})

test('computeRMS 混合樣本', () => {
  // [0.6, 0.8] → sqrt((0.36+0.64)/2) = sqrt(0.5)
  const rms = computeRMS([0.6, 0.8])
  assert.ok(Math.abs(rms - Math.sqrt(0.5)) < 1e-9)
  // Float32Array 亦可（Float32 精度約 1e-7，容差放寬到 1e-6）
  const rms2 = computeRMS(new Float32Array([0.6, 0.8]))
  assert.ok(Math.abs(rms2 - Math.sqrt(0.5)) < 1e-6)
})

test('computeRMS 非數值樣本視為 0', () => {
  assert.equal(computeRMS([NaN, 1]), Math.sqrt(0.5))
})

test('rmsToPercent 線性映射與 clamp', () => {
  assert.equal(rmsToPercent(0), 0)
  assert.equal(rmsToPercent(1), 100)
  assert.equal(rmsToPercent(0.5), 50)
  assert.equal(rmsToPercent(-0.1), 0)
  assert.equal(rmsToPercent(1.5), 100)
  assert.equal(rmsToPercent(NaN), 0)
})

test('rmsToPercent 自訂 min/max', () => {
  assert.equal(rmsToPercent(0.3, { min: 0.2, max: 0.4 }), 50)
  assert.equal(rmsToPercent(0.1, { min: 0.2, max: 0.4 }), 0)
  assert.equal(rmsToPercent(0.5, { min: 0.2, max: 0.4 }), 100)
  assert.equal(rmsToPercent(0.5, { min: 0.5, max: 0.5 }), 0)
})

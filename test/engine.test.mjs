import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateEngine } from '../src/engines/engine.mjs';
import { MockEngine } from '../src/engines/mock-engine.mjs';

test('validateEngine 通過完整實作', () => {
  const engine = new MockEngine();
  assert.deepEqual(validateEngine(engine), { ok: true });
});

test('validateEngine 檢查缺方法', () => {
  const r = validateEngine({ start() {}, push() {} });
  assert.equal(r.ok, false);
  assert.match(r.error, /end/);
  assert.equal(validateEngine(null).ok, false);
  assert.equal(validateEngine(undefined).ok, false);
});

test('MockEngine 基本生命週期', () => {
  const engine = new MockEngine({ script: '你好世界', charsPerChunk: 2, delayChunks: 1 });
  const started = engine.start({ sampleRate: 16000 });
  assert.deepEqual(started, { ok: true });

  // 前 delayChunks 塊不吐字
  assert.deepEqual(engine.push(new Int16Array(10)), { text: '', done: false });
  // 之後每塊 +charsPerChunk
  assert.deepEqual(engine.push(new Int16Array(10)), { text: '你好', done: false });
  assert.deepEqual(engine.push(new Int16Array(10)), { text: '你好世界', done: false });
  // end 沖洗完全文
  assert.deepEqual(engine.end(), { text: '你好世界', done: true });
});

test('MockEngine 未 start 時 push/end 安全', () => {
  const engine = new MockEngine();
  assert.deepEqual(engine.push(new Int16Array(10)), { text: '', done: false });
  assert.deepEqual(engine.end(), { text: '', done: true });
});

test('MockEngine reset 後可重複使用', () => {
  const engine = new MockEngine({ script: '甲乙丙丁', charsPerChunk: 1, delayChunks: 0 });
  engine.start({ sampleRate: 16000 });
  engine.push(new Int16Array(10));
  assert.equal(engine.push(new Int16Array(10)).text, '甲乙');
  engine.reset();
  engine.start({ sampleRate: 16000 });
  assert.equal(engine.push(new Int16Array(10)).text, '甲');
  assert.equal(engine.end().text, '甲乙丙丁');
});

test('MockEngine start 拒絕非法採樣率', () => {
  const engine = new MockEngine();
  const r = engine.start({ sampleRate: 0 });
  assert.equal(r.ok, false);
  assert.ok(r.error.includes('sampleRate'));
});

test('MockEngine 溢出不超過全文', () => {
  const engine = new MockEngine({ script: 'AB', charsPerChunk: 5, delayChunks: 0 });
  engine.start({ sampleRate: 16000 });
  engine.push(new Int16Array(10));
  engine.push(new Int16Array(10));
  assert.equal(engine.push(new Int16Array(10)).text, 'AB');
});

test('MockEngine 全文含英文保留原樣', () => {
  const engine = new MockEngine({ script: 'setTimeout 喺 node 度跑', charsPerChunk: 100, delayChunks: 0 });
  engine.start({ sampleRate: 16000 });
  engine.push(new Int16Array(10));
  assert.equal(engine.end().text, 'setTimeout 喺 node 度跑');
});

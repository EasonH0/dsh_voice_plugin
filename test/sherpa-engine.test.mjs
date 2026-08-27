import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateEngine } from '../src/engines/engine.mjs';
import { SherpaEngine } from '../src/engines/sherpa-engine.mjs';

test('SherpaEngine 符合 IEngine 契約', () => {
  const engine = new SherpaEngine({ modelDir: 'nonexistent-dir' });
  assert.deepEqual(validateEngine(engine), { ok: true });
});

test('SherpaEngine 未安裝模型時 start 回 ok:false 且帶錯誤', () => {
  const engine = new SherpaEngine({ modelDir: 'nonexistent-dir' });
  const r = engine.start({ sampleRate: 16000 });
  assert.equal(r.ok, false);
  assert.ok(typeof r.error === 'string' && r.error.length > 0);
});

test('SherpaEngine 未啟動時 push/end 安全', () => {
  const engine = new SherpaEngine({ modelDir: 'nonexistent-dir' });
  assert.deepEqual(engine.push(new Int16Array(10)), { text: '', done: false });
  assert.deepEqual(engine.end(), { text: '', done: true });
});

test('SherpaEngine dispose 後可重複 start', () => {
  const engine = new SherpaEngine({ modelDir: 'nonexistent-dir' });
  const r1 = engine.start({ sampleRate: 16000 });
  assert.equal(r1.ok, false);
  engine.dispose();
  const r2 = engine.start({ sampleRate: 16000 });
  assert.equal(r2.ok, false); // 仍因模型不存在而失敗，但流程可重入
});

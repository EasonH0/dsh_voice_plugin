import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bytesToBase64,
  base64ToBytes,
  int16ToBytes,
  bytesToInt16,
  int16ToBase64,
  base64ToInt16,
  buildChunk,
} from '../src/core/chunker.mjs';

test('base64 往返（各種長度）', () => {
  for (const len of [0, 1, 2, 3, 4, 255, 1024]) {
    const src = new Uint8Array(len);
    for (let i = 0; i < len; i++) src[i] = (i * 37 + 11) & 0xff;
    const back = base64ToBytes(bytesToBase64(src));
    assert.deepEqual([...back], [...src], `len=${len}`);
  }
});

test('int16 位元組往返（含負數與邊界值）', () => {
  const src = new Int16Array([0, 1, -1, 32767, -32768, 12345, -5432]);
  const back = bytesToInt16(int16ToBytes(src));
  assert.deepEqual([...back], [...src]);
});

test('int16ToBase64 往返', () => {
  const src = new Int16Array(500);
  for (let i = 0; i < src.length; i++) src[i] = (i * 7 - 1000) & 0xffff;
  const back = base64ToInt16(int16ToBase64(src));
  assert.deepEqual([...back], [...src]);
});

test('buildChunk 形狀', () => {
  const chunk = buildChunk(3, new Int16Array([1, 2, 3]));
  assert.equal(chunk.seq, 3);
  assert.equal(typeof chunk.b64, 'string');
  assert.deepEqual([...base64ToInt16(chunk.b64)], [1, 2, 3]);
});

test('base64ToBytes 容忍空白與換行', () => {
  const src = new Uint8Array([1, 2, 3]);
  const b64 = bytesToBase64(src);
  assert.deepEqual([...base64ToBytes(`  ${b64}\n`)], [1, 2, 3]);
});

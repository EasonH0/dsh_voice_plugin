// make-tone-wav.mjs — 產生 16kHz 測試 wav（400Hz 音調＋靜音），供管線煙霧測試
// 用法：node scripts/make-tone-wav.mjs [輸出路徑]

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const outPath = process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..', 'test-audio', 'tone-16k.wav');
mkdirSync(dirname(outPath), { recursive: true });

const sampleRate = 16000;
const seconds = 2.5;
const n = Math.floor(sampleRate * seconds);
const pcm = new Int16Array(n);
for (let i = 0; i < n; i++) {
  const t = i / sampleRate;
  // 前 1.5 秒 400Hz 音調、後 1 秒靜音
  const v = i < sampleRate * 1.5 ? Math.sin(2 * Math.PI * 400 * t) * 12000 : 0;
  pcm[i] = Math.round(v);
}

// 寫 44 位元組 WAV 頭 + PCM
const dataSize = pcm.length * 2;
const buf = Buffer.alloc(44 + dataSize);
buf.write('RIFF', 0, 'ascii');
buf.writeUInt32LE(36 + dataSize, 4);
buf.write('WAVE', 8, 'ascii');
buf.write('fmt ', 12, 'ascii');
buf.writeUInt32LE(16, 16);
buf.writeUInt16LE(1, 20); // PCM
buf.writeUInt16LE(1, 22); // mono
buf.writeUInt32LE(sampleRate, 24);
buf.writeUInt32LE(sampleRate * 2, 28);
buf.writeUInt16LE(2, 32);
buf.writeUInt16LE(16, 34);
buf.write('data', 36, 'ascii');
buf.writeUInt32LE(dataSize, 40);
for (let i = 0; i < pcm.length; i++) {
  buf.writeInt16LE(pcm[i], 44 + i * 2);
}
writeFileSync(outPath, buf);
console.log('已產生測試音訊：', outPath);

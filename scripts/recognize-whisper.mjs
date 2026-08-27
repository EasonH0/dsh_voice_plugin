// recognize-whisper.mjs — CLI 辨識測試：wav → Whisper large-v3 → 文字
// 用法：node scripts/recognize-whisper.mjs <wav檔案> [language]
// language：可選 'zh' | 'yue' | 'en'（不傳 = 自動偵測）
// 首次執行會自動下載模型（數 GB，需時較長）。

import { readFileSync } from 'node:fs';

const wavPath = process.argv[2];
const language = process.argv[3] ?? null;
if (!wavPath) {
  console.error('用法：node scripts/recognize-whisper.mjs <wav檔案> [language]');
  process.exit(1);
}

function parseWav(path) {
  const buf = readFileSync(path);
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('不是有效的 WAV 檔案');
  }
  const sampleRate = buf.readUInt32LE(24);
  const bits = buf.readUInt16LE(34);
  let offset = 12;
  let dataOffset = -1;
  let dataLen = 0;
  while (offset + 8 <= buf.length) {
    const id = buf.toString('ascii', offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    if (id === 'data') {
      dataOffset = offset + 8;
      dataLen = size;
      break;
    }
    offset += 8 + size + (size % 2);
  }
  if (dataOffset < 0) throw new Error('找不到 data chunk');
  const pcm = new Int16Array(buf.buffer.slice(dataOffset, dataOffset + dataLen));
  return { sampleRate, bits, pcm };
}

const { sampleRate, pcm } = parseWav(wavPath);
console.log(`音訊：${sampleRate}Hz 16-bit，${(pcm.length / sampleRate).toFixed(2)} 秒`);

const { WhisperEngine } = await import('../src/engines/whisper-engine.mjs');
const engine = new WhisperEngine({ language });
console.log('載入 Whisper large-v3（首次需下載模型，請耐心等候）…');
const t0 = Date.now();
const started = await engine.start({ sampleRate: 16000 });
if (!started.ok) {
  console.error('引擎啟動失敗：', started.error);
  process.exit(1);
}
console.log(`模型載入完成（${((Date.now() - t0) / 1000).toFixed(1)} 秒）`);

const chunkSize = 16000; // 1 秒一塊餵入
for (let i = 0; i < pcm.length; i += chunkSize) {
  engine.push(pcm.subarray(i, Math.min(i + chunkSize, pcm.length)));
}
const t1 = Date.now();
const final = await engine.end();
const elapsed = (Date.now() - t1) / 1000;
console.log('\n最終辨識結果：');
console.log(final.text || '（無內容）');
console.log(`\n辨識耗時 ${elapsed.toFixed(2)} 秒（音訊 ${(pcm.length / sampleRate).toFixed(2)} 秒，RTF ${(elapsed / (pcm.length / sampleRate)).toFixed(3)}）`);
if (final.error) console.log('錯誤：', final.error);

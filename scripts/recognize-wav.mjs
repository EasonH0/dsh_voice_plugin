// recognize-wav.mjs — CLI 串流辨識測試：wav → sherpa 串流 → 文字
// 用法：node scripts/recognize-wav.mjs <wav檔案> [模型目錄]
// wav 需為 16kHz・16-bit・單聲道（Windows 語音錄音機輸出即此格式或需轉換）。

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const wavPath = process.argv[2];
const modelDir = process.argv[3];
if (!wavPath) {
  console.error('用法：node scripts/recognize-wav.mjs <wav檔案> [模型目錄]');
  process.exit(1);
}

// 最小 wav 解析（16kHz・16-bit・單聲道 PCM）
function parseWav(path) {
  const buf = readFileSync(path);
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('不是有效的 WAV 檔案');
  }
  const sampleRate = buf.readUInt32LE(24);
  const channels = buf.readUInt16LE(22);
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
  return { sampleRate, channels, bits, pcm };
}

const { sampleRate, channels, bits, pcm } = parseWav(wavPath);
console.log(`音訊：${sampleRate}Hz ${bits}-bit ${channels} 聲道，${(pcm.length / sampleRate).toFixed(2)} 秒`);

const { SherpaEngine } = await import('../src/engines/sherpa-engine.mjs');
const engine = new SherpaEngine({ modelDir });
const started = engine.start({ sampleRate: 16000 });
if (!started.ok) {
  console.error('引擎啟動失敗：', started.error);
  process.exit(1);
}
console.log('引擎啟動成功（串流三語：粵・中・英）');

const chunkSize = 4000; // 250ms
const t0 = Date.now();
let lastLen = 0;
for (let i = 0; i < pcm.length; i += chunkSize) {
  const chunk = pcm.subarray(i, Math.min(i + chunkSize, pcm.length));
  const r = engine.push(chunk);
  if (r.text.length > lastLen) {
    console.log('  增量：', r.text.slice(lastLen));
    lastLen = r.text.length;
  }
}
const final = engine.end();
const elapsed = (Date.now() - t0) / 1000;
console.log('\n最終辨識結果：');
console.log(final.text || '（無內容）');
console.log(`\n耗時 ${elapsed.toFixed(2)} 秒（音訊 ${(pcm.length / sampleRate).toFixed(2)} 秒，RTF ${(elapsed / (pcm.length / sampleRate)).toFixed(3)}）`);

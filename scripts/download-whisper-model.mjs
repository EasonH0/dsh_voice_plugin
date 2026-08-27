// download-whisper-model.mjs — 下載 Whisper large-v3（transformers.js ONNX 量化版）到本機
// 用法：node scripts/download-whisper-model.mjs
// 輸出：models/whisper-large-v3/（可離線載入，無需 HF 快取）

import { mkdirSync, writeFileSync, createWriteStream, existsSync, statSync } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'models', 'whisper-large-v3');
const BASE = 'https://huggingface.co/Xenova/whisper-large-v3/resolve/main';

const FILES = [
  'config.json',
  'generation_config.json',
  'preprocessor_config.json',
  'tokenizer.json',
  'onnx/encoder_model_quantized.onnx',
  'onnx/decoder_model_merged_quantized.onnx',
];

async function downloadOne(relPath) {
  const dest = join(OUT_DIR, relPath);
  mkdirSync(dirname(dest), { recursive: true });
  if (existsSync(dest) && statSync(dest).size > 1000) {
    console.log('  已存在，跳過：', relPath);
    return;
  }
  const url = `${BASE}/${relPath}`;
  console.log('  下載：', relPath);
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) {
    console.error('  失敗 HTTP', res.status, '：', relPath);
    return;
  }
  const total = Number(res.headers.get('content-length') ?? 0);
  let done = 0;
  const body = Readable.fromWeb(res.body);
  const counter = new Transform();
  counter._transform = (chunk, _enc, cb) => {
    done += chunk.length;
    if (total > 0) process.stdout.write('\r    ' + ((done / total) * 100).toFixed(1) + '%');
    cb(null, chunk);
  };
  await pipeline(body, counter, createWriteStream(dest));
  console.log('  完成：', relPath);
}

import { Transform } from 'node:stream';

console.log('下載 Whisper large-v3 量化模型到', OUT_DIR);
for (const f of FILES) {
  await downloadOne(f);
}
console.log('全部完成。');

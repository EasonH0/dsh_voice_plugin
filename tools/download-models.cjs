// tools/download-models.cjs — dsh-voice-input 模型下載工具（bin：dsh-voice-input-models）
// 用法：
//   npx dsh-voice-input-models                 → 下載 sherpa 流式三語模型（int8，約 230MB）
//   npx dsh-voice-input-models --whisper       → 加下 Whisper large-v3 量化模型（約 2GB）
//   npx dsh-voice-input-models --dir <路徑>    → 指定下載目錄（預設 ./dsh-voice-input-models）
// 模型不進 Git／npm 包：首次使用前執行本工具一次即可。

'use strict';
const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { Transform } = require('node:stream');

const args = process.argv.slice(2);
const wantWhisper = args.includes('--whisper');
const dirIdx = args.indexOf('--dir');
const OUT_DIR = dirIdx >= 0 && args[dirIdx + 1] ? path.resolve(args[dirIdx + 1]) : path.join(process.cwd(), 'dsh-voice-input-models');

const HF_BASE = 'https://huggingface.co';

const SHERPA_DIR = 'sherpa-onnx-streaming-paraformer-trilingual-zh-cantonese-en';
const SHERPA_FILES = [
  'encoder.int8.onnx',
  'decoder.int8.onnx',
  'tokens.txt',
];
const WHISPER_DIR = 'whisper-large-v3';
const WHISPER_FILES = [
  'config.json',
  'generation_config.json',
  'preprocessor_config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'added_tokens.json',
  'onnx/encoder_model_quantized.onnx',
  'onnx/decoder_model_merged_quantized.onnx',
];

function fetchBuf(url, redirects = 3) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'user-agent': 'dsh-voice-input-models' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
        res.resume();
        resolve(fetchBuf(new URL(res.headers.location, url).toString(), redirects - 1));
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error('HTTP ' + res.statusCode + ' for ' + url));
        return;
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function downloadOne(hfRepo, relPath, destRel) {
  const dest = path.join(OUT_DIR, destRel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) {
    console.log('  已存在，跳過：', destRel);
    return;
  }
  const url = `${HF_BASE}/${hfRepo}/resolve/main/${relPath}`;
  const part = dest + '.part';
  console.log('  下載：', destRel);
  const res = await new Promise((resolve, reject) => {
    https.get(url, { headers: { 'user-agent': 'dsh-voice-input-models' } }, (r) => {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) {
        r.resume();
        https.get(new URL(r.headers.location, url).toString(), { headers: { 'user-agent': 'dsh-voice-input-models' } }, (r2) => resolve(r2)).on('error', reject);
        return;
      }
      if (r.statusCode !== 200) {
        r.resume();
        reject(new Error('HTTP ' + r.statusCode + ' for ' + url));
        return;
      }
      resolve(r);
    }).on('error', reject);
  });
  const total = Number(res.headers['content-length'] ?? 0);
  let done = 0;
  const counter = new Transform({
    transform(chunk, _enc, cb) {
      done += chunk.length;
      if (total > 0) process.stdout.write('\r    ' + ((done / total) * 100).toFixed(1) + '%');
      cb(null, chunk);
    },
  });
  await pipeline(Readable.fromWeb ? Readable.fromWeb(res) : res, counter, fs.createWriteStream(part));
  fs.renameSync(part, dest);
  console.log('  完成：', destRel);
}

async function main() {
  console.log('dsh-voice-input 模型下載');
  console.log('目標目錄：', OUT_DIR);
  console.log('');
  console.log('[1/2] sherpa-onnx 串流三語模型（粵・中・英，int8）');
  for (const f of SHERPA_FILES) {
    await downloadOne('csukuangfj/sherpa-onnx-streaming-paraformer-trilingual-zh-cantonese-en', f, path.join(SHERPA_DIR, f));
  }
  if (wantWhisper) {
    console.log('');
    console.log('[2/2] Whisper large-v3（量化版，高準確模式）');
    for (const f of WHISPER_FILES) {
      await downloadOne('Xenova/whisper-large-v3', f, path.join(WHISPER_DIR, f));
    }
  } else {
    console.log('');
    console.log('（未加 --whisper，跳過高準確引擎模型；需要時執行：npx dsh-voice-input-models --whisper）');
  }
  console.log('');
  console.log('全部完成。');
  console.log('在 profile 的 cordis.patch.yml 確認 modelDir 指向此目錄（留空則預設同此目錄名）。');
}

main().catch((err) => {
  console.error('下載失敗：', err.message);
  process.exit(1);
});

// scripts/download-model.mjs — 下載 sherpa-onnx 串流三語模型（粵・中・英，int8）
// 用法：node scripts/download-model.mjs
// 下載後自動解壓至 models/ 目錄（models 不進版本庫，見 .gitignore）。

import { createWriteStream, mkdirSync, existsSync } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const MODELS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'models');
const URL = 'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-streaming-paraformer-trilingual-zh-cantonese-en.tar.bz2';
const ARCHIVE = join(MODELS_DIR, 'sherpa-paraformer-trilingual.tar.bz2');

mkdirSync(MODELS_DIR, { recursive: true });

async function download() {
  console.log('下载模型：', URL);
  const res = await fetch(URL, { redirect: 'follow' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const total = Number(res.headers.get('content-length') ?? 0);
  let done = 0;
  const body = Readable.fromWeb(res.body);
  const report = new Transform2((chunk) => {
    done += chunk.length;
    if (total > 0) process.stdout.write('\r  ' + ((done / total) * 100).toFixed(1) + '% (' + (done / 1048576).toFixed(1) + ' MB / ' + (total / 1048576).toFixed(1) + ' MB)');
  });
  await pipeline(body, report, createWriteStream(ARCHIVE));
  console.log('\n下载完成：', ARCHIVE);
}

// 簡易 Transform（避免額外依賴）
import { Transform } from 'node:stream';
class Transform2 extends Transform {
  constructor(fn) {
    super({ transform: (chunk, _enc, cb) => { fn(chunk); cb(null, chunk); } });
  }
}

function extract() {
  console.log('解压中…');
  const r = spawnSync('tar', ['-xjf', ARCHIVE, '-C', MODELS_DIR], { stdio: 'inherit', shell: true });
  if (r.status !== 0) {
    console.error('tar 解压失败（Windows 内建 bsdtar 应可处理 bz2）。请手动解压 ' + ARCHIVE + ' 到 ' + MODELS_DIR);
    process.exit(1);
  }
  console.log('解压完成。模型目录：', MODELS_DIR);
}

async function main() {
  if (!existsSync(ARCHIVE)) {
    await download();
  } else {
    console.log('已存在，跳过下载：', ARCHIVE);
  }
  extract();
}

main().catch((err) => {
  console.error('下载失败：', err.message);
  process.exit(1);
});

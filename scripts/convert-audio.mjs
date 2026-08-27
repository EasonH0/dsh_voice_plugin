// convert-audio.mjs — 任意音訊（m4a/mp3/wav…）→ 16kHz・16-bit・單聲道 wav
// 用法：node scripts/convert-audio.mjs <輸入檔案> [輸出路徑]

import { spawnSync } from 'node:child_process';
import { join, dirname, basename, extname } from 'node:path';
import { mkdirSync } from 'node:fs';
import ffmpegPath from 'ffmpeg-static';

const input = process.argv[2];
if (!input) {
  console.error('用法：node scripts/convert-audio.mjs <輸入檔案> [輸出路徑]');
  process.exit(1);
}
const defaultOut = join(dirname(input), basename(input, extname(input)) + '-16k.wav');
const output = process.argv[3] ?? defaultOut;
mkdirSync(dirname(output), { recursive: true });

console.log('轉檔：', input, '→', output);
const r = spawnSync(ffmpegPath, [
  '-y', '-i', input,
  '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le',
  output,
], { stdio: 'inherit' });
if (r.status !== 0) {
  console.error('ffmpeg 轉檔失敗');
  process.exit(1);
}
console.log('轉檔完成：', output);

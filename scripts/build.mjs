// 零依賴建構腳本：src/（源碼）→ lib/（產物，提交進 repo）
//
// 1. lib/client.js：把 src/core/*.js（去除 export 關鍵字）與 src/client.js
//    拼進 window.__ModuleLoader__.load 的 factory scope（client 單檔 bundle，
//    DSH client 只能 require 白名單 specifier，無法載入自己的多檔案）。
// 2. lib/index.js：直接複製 src/host.js（ESM）。
//
// 風格約束（strip export 的前提）：
// - core 檔只使用行首 `export function`／`export const`（正則逐行去除）。
// - src/client.js 不使用 import/export，直接引用 core 注入的自由變數。
//
// 用法：node scripts/build.mjs
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const coreDir = join(root, 'src', 'core');
const libDir = join(root, 'lib');

function stripExports(code) {
  return code
    .split('\n')
    .map((line) =>
      line
        .replace(/^export function /, 'function ')
        .replace(/^export const /, 'const '),
    )
    .join('\n');
}

function buildClient() {
  const coreFiles = readdirSync(coreDir)
    .filter((f) => f.endsWith('.js'))
    .sort();
  const coreCode = coreFiles
    .map((f) => `// === core/${f} ===\n` + stripExports(readFileSync(join(coreDir, f), 'utf8')))
    .join('\n\n');
  const clientCode = readFileSync(join(root, 'src', 'client.js'), 'utf8');
  const banner =
    '// 建構產物：由 scripts/build.mjs 從 src/ 產生，勿手改。\n' +
    '// 修改請改 src/ 後執行：node scripts/build.mjs\n';
  return (
    banner +
    'window.__ModuleLoader__.load({\n' +
    '\tid: "dsh-voice-input",\n' +
    '\tfactory: (require) => {\n' +
    '\t\tvar module = { exports: {} };\n' +
    '\t\tvar exports = module.exports;\n' +
    '\n' +
    coreCode +
    '\n\n' +
    clientCode +
    '\n\n' +
    '\t\treturn module.exports;\n' +
    '\t}\n' +
    '});\n'
  );
}

function buildHost() {
  return readFileSync(join(root, 'src', 'host.js'), 'utf8');
}

mkdirSync(libDir, { recursive: true });
writeFileSync(join(libDir, 'client.js'), buildClient());
writeFileSync(join(libDir, 'index.js'), buildHost());
console.log('build ok: lib/client.js, lib/index.js');

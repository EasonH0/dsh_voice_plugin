import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPolishMessages, POLISH_SYSTEM_PROMPT } from '../src/host/polish.mjs';

test('buildPolishMessages 基本形狀', () => {
  const m = buildPolishMessages('我要setTimeout喺node度跑');
  assert.equal(typeof m.system, 'string');
  assert.equal(m.user, '我要setTimeout喺node度跑');
  assert.equal(m.system, POLISH_SYSTEM_PROMPT);
});

test('buildPolishMessages 修剪空白', () => {
  const m = buildPolishMessages('  有空格  ');
  assert.equal(m.user, '有空格');
});

test('buildPolishMessages 空輸入保護', () => {
  const m = buildPolishMessages('');
  assert.equal(m.user, '（無內容）');
});

test('system prompt 涵蓋核心規則', () => {
  assert.ok(POLISH_SYSTEM_PROMPT.includes('繁體中文書面語'));
  assert.ok(POLISH_SYSTEM_PROMPT.includes('標點符號'));
  assert.ok(POLISH_SYSTEM_PROMPT.includes('英文單詞'));
  assert.ok(POLISH_SYSTEM_PROMPT.includes('不增刪'));
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseHotkey,
  serializeHotkey,
  eventToToken,
  matchesKeySequence,
} from '../src/core/hotkeys.mjs';

test('parseHotkey 序列解析（含修飾鍵）', () => {
  assert.deepEqual(parseHotkey('Alt+KeyM'), ['Alt', 'KeyM']);
  assert.deepEqual(parseHotkey('Ctrl+Shift+Digit1'), ['Control', 'Shift', 'Digit1']);
  assert.deepEqual(parseHotkey('F5'), ['F5']);
});

test('parseHotkey 任意數量組合', () => {
  assert.deepEqual(parseHotkey('KeyC+KeyV+KeyB+KeyN'), ['KeyC', 'KeyV', 'KeyB', 'KeyN']);
  assert.deepEqual(parseHotkey('Ctrl+Alt+Space'), ['Control', 'Alt', 'Space']);
  assert.deepEqual(parseHotkey('KeyC+KeyC'), ['KeyC', 'KeyC']); // 允許重複鍵
});

test('parseHotkey 大小寫不敏感、正規化', () => {
  assert.deepEqual(parseHotkey('ctrl+alt+keym'), ['Control', 'Alt', 'KeyM']);
  assert.deepEqual(parseHotkey('altleft+KeyM'), ['Alt', 'KeyM']);
});

test('parseHotkey 非法回 null', () => {
  for (const bad of ['', 'Alt+', 'Xyz', 'KeyN+Alt+Xyz', null, 5, 'Alt+Pause']) {
    assert.equal(parseHotkey(bad), null, `input: ${bad}`);
  }
});

test('serializeHotkey 往返', () => {
  assert.equal(serializeHotkey(['Alt', 'KeyM']), 'Alt+KeyM');
  assert.equal(serializeHotkey('ctrl+shift+keyP'), 'Control+Shift+KeyP');
  assert.equal(serializeHotkey(['KeyC', 'KeyV', 'KeyB', 'KeyN']), 'KeyC+KeyV+KeyB+KeyN');
  assert.equal(serializeHotkey([]), '');
  assert.equal(serializeHotkey('nonsense'), '');
});

test('eventToToken 修飾鍵左右變體統一', () => {
  assert.equal(eventToToken({ code: 'AltLeft', repeat: false }), 'Alt');
  assert.equal(eventToToken({ code: 'AltRight', repeat: false }), 'Alt');
  assert.equal(eventToToken({ code: 'ControlLeft', repeat: false }), 'Control');
  assert.equal(eventToToken({ code: 'ShiftRight', repeat: false }), 'Shift');
  assert.equal(eventToToken({ code: 'MetaLeft', repeat: false }), 'Meta');
  assert.equal(eventToToken({ code: 'KeyM', repeat: false }), 'KeyM');
  assert.equal(eventToToken({ code: 'Space', repeat: false }), 'Space');
});

test('eventToToken 忽略 repeat 與非法鍵', () => {
  assert.equal(eventToToken({ code: 'KeyM', repeat: true }), null);
  assert.equal(eventToToken({ code: 'Pause', repeat: false }), null);
  assert.equal(eventToToken(null), null);
});

test('matchesKeySequence 滑動窗比對', () => {
  assert.ok(matchesKeySequence(['Alt', 'KeyM'], ['Alt', 'KeyM']));
  assert.ok(matchesKeySequence(['KeyC', 'KeyV', 'KeyB', 'KeyN'], ['KeyC', 'KeyV', 'KeyB', 'KeyN']));
  // 緩衝更長時只看尾端
  assert.ok(matchesKeySequence(['KeyA', 'KeyC', 'KeyV'], ['KeyC', 'KeyV']));
  assert.ok(!matchesKeySequence(['KeyC', 'KeyX', 'KeyV'], ['KeyC', 'KeyV']));
  assert.ok(!matchesKeySequence(['KeyC'], ['KeyC', 'KeyV']));
  assert.ok(!matchesKeySequence([], ['KeyV']));
  assert.ok(!matchesKeySequence(['KeyV'], []));
});

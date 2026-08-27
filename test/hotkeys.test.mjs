import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseHotkey,
  serializeHotkey,
  matchesHotkey,
} from '../src/core/hotkeys.mjs';

test('parseHotkey 合法格式', () => {
  assert.deepEqual(parseHotkey('Alt+KeyM'), {
    ctrl: false, alt: true, shift: false, meta: false, code: 'KeyM',
  });
  assert.deepEqual(parseHotkey('Ctrl+Shift+Digit1'), {
    ctrl: true, alt: false, shift: true, meta: false, code: 'Digit1',
  });
  assert.deepEqual(parseHotkey('F5'), {
    ctrl: false, alt: false, shift: false, meta: false, code: 'F5',
  });
});

test('parseHotkey 擴充可綁定按鍵（大小寫不敏感、正規化）', () => {
  assert.deepEqual(parseHotkey('Ctrl+Space'), {
    ctrl: true, alt: false, shift: false, meta: false, code: 'Space',
  });
  assert.deepEqual(parseHotkey('alt+enter'), {
    ctrl: false, alt: true, shift: false, meta: false, code: 'Enter',
  });
  assert.deepEqual(parseHotkey('ArrowUp'), {
    ctrl: false, alt: false, shift: false, meta: false, code: 'ArrowUp',
  });
  assert.deepEqual(parseHotkey('Shift+pageDown'), {
    ctrl: false, alt: false, shift: true, meta: false, code: 'PageDown',
  });
  assert.deepEqual(parseHotkey('Ctrl+Comma'), {
    ctrl: true, alt: false, shift: false, meta: false, code: 'Comma',
  });
  assert.deepEqual(parseHotkey('Alt+Slash'), {
    ctrl: false, alt: true, shift: false, meta: false, code: 'Slash',
  });
});

test('parseHotkey 非法格式回 null', () => {
  for (const bad of ['', 'M', 'Alt+', 'KeyM+KeyN', 'Alt+Xyz', 'Alt+Pause', null, 5]) {
    assert.equal(parseHotkey(bad), null, `input: ${bad}`);
  }
});

test('serializeHotkey 往返', () => {
  assert.equal(serializeHotkey('Alt+KeyM'), 'Alt+KeyM');
  assert.equal(serializeHotkey('ctrl+shift+keyP'), 'Ctrl+Shift+KeyP');
  assert.equal(
    serializeHotkey({ ctrl: false, alt: true, shift: false, meta: false, code: 'KeyV' }),
    'Alt+KeyV',
  );
  assert.equal(serializeHotkey('nonsense'), '');
});

test('matchesHotkey 事件匹配', () => {
  const hk = parseHotkey('Alt+KeyM');
  assert.ok(matchesHotkey(
    { code: 'KeyM', ctrlKey: false, altKey: true, shiftKey: false, metaKey: false },
    hk,
  ));
  assert.ok(!matchesHotkey(
    { code: 'KeyM', ctrlKey: false, altKey: false, shiftKey: false, metaKey: false },
    hk,
  ));
  assert.ok(!matchesHotkey(
    { code: 'KeyN', ctrlKey: false, altKey: true, shiftKey: false, metaKey: false },
    hk,
  ));
  // 額外修飾鍵按下視為不命中（嚴謹匹配）
  assert.ok(!matchesHotkey(
    { code: 'KeyM', ctrlKey: true, altKey: true, shiftKey: false, metaKey: false },
    hk,
  ));
});

test('matchesHotkey 無效輸入', () => {
  assert.ok(!matchesHotkey(null, 'Alt+KeyM'));
  assert.ok(!matchesHotkey({ code: 'KeyM' }, 'bad-spec'));
});

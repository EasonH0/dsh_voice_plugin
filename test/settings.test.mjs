import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULTS,
  DEFAULT_HOTKEYS,
  normalizeSettings,
  normalizeHotkeys,
  validateSetting,
  settingsEqual,
} from '../src/core/settings.mjs';

test('DEFAULTS 形狀完整', () => {
  assert.equal(DEFAULTS.engine, 'sherpa');
  assert.equal(DEFAULTS.recordMode, 'toggle');
  assert.equal(DEFAULTS.noiseSuppression, true);
  assert.equal(DEFAULTS.polish, true);
  assert.equal(DEFAULTS.polishProvider, '');
  assert.equal(DEFAULTS.polishModel, '');
  assert.equal(DEFAULTS.autoSend, false);
  assert.deepEqual(DEFAULTS.hotkeys, DEFAULT_HOTKEYS);
});

test('normalizeSettings 空輸入回預設', () => {
  const s = normalizeSettings(undefined);
  assert.deepEqual(s, { ...DEFAULTS, hotkeys: { ...DEFAULT_HOTKEYS } });
});

test('normalizeSettings 合併合法值', () => {
  const s = normalizeSettings({
    engine: 'whisper',
    autoSend: true,
    polish: false,
    polishProvider: 'deepseek',
    polishModel: 'deepseek-chat',
  });
  assert.equal(s.engine, 'whisper');
  assert.equal(s.autoSend, true);
  assert.equal(s.polish, false);
  assert.equal(s.polishProvider, 'deepseek');
  assert.equal(s.polishModel, 'deepseek-chat');
  assert.equal(s.recordMode, 'toggle');
});

test('normalizeSettings 未知鍵丟棄', () => {
  const s = normalizeSettings({ nonsense: 1, engine: 'sherpa' });
  assert.ok(!('nonsense' in s));
});

test('normalizeSettings 非法值回退預設', () => {
  const s = normalizeSettings({ engine: 'watson', noiseSuppression: 'yes' });
  assert.equal(s.engine, 'sherpa');
  assert.equal(s.noiseSuppression, true);
});

test('validateSetting 各鍵合法/非法', () => {
  assert.equal(validateSetting('engine', 'whisper'), 'whisper');
  assert.equal(validateSetting('engine', 'x'), undefined);
  assert.equal(validateSetting('recordMode', 'ptt'), 'ptt');
  assert.equal(validateSetting('monitor', false), false);
  assert.equal(validateSetting('monitor', 1), undefined);
  assert.equal(validateSetting('inputDeviceId', 'abc'), 'abc');
  assert.equal(validateSetting('inputDeviceId', 5), undefined);
  assert.equal(validateSetting('polishProvider', 'deepseek'), 'deepseek');
  assert.equal(validateSetting('polishProvider', 9), undefined);
  assert.equal(validateSetting('polishModel', ''), '');
});

test('normalizeHotkeys 缺項補預設', () => {
  const h = normalizeHotkeys({ toggle: 'Alt+KeyX' });
  assert.equal(h.toggle, 'Alt+KeyX');
  assert.equal(h.ptt, DEFAULT_HOTKEYS.ptt);
});

test('settingsEqual 比較正規化後內容', () => {
  assert.ok(settingsEqual({}, DEFAULTS));
  assert.ok(settingsEqual({ autoSend: true }, { autoSend: true }));
  assert.ok(!settingsEqual({ autoSend: true }, { autoSend: false }));
  assert.ok(settingsEqual({ hotkeys: {} }, { hotkeys: DEFAULT_HOTKEYS }));
});

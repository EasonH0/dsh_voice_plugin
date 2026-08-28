import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_SETTINGS, LANGS, RECORDING_MODES, sanitizeSettings } from '../src/core/settings.js'

test('DEFAULT_SETTINGS 預設值符合決策', () => {
  assert.equal(DEFAULT_SETTINGS.lang, 'zh-HK')
  assert.equal(DEFAULT_SETTINGS.recordingMode, 'toggle')
  assert.equal(DEFAULT_SETTINGS.polish, true)
  assert.equal(DEFAULT_SETTINGS.autoSend, false)
  assert.equal(DEFAULT_SETTINGS.stopOnMute, false)
  assert.equal(DEFAULT_SETTINGS.noiseSuppression, true)
  assert.equal(DEFAULT_SETTINGS.echoCancellation, false)
  assert.equal(DEFAULT_SETTINGS.autoGainControl, true)
  assert.equal(DEFAULT_SETTINGS.listen, false)
  assert.deepEqual(LANGS, ['zh-HK', 'zh-CN', 'en'])
  assert.deepEqual(RECORDING_MODES, ['toggle', 'ptt'])
})

test('sanitizeSettings 空輸入補全預設', () => {
  const s = sanitizeSettings(undefined)
  assert.deepEqual(s, { ...DEFAULT_SETTINGS })
  const s2 = sanitizeSettings({})
  assert.deepEqual(s2, { ...DEFAULT_SETTINGS })
})

test('sanitizeSettings 非法枚舉回退預設', () => {
  const s = sanitizeSettings({ lang: 'ja-JP', recordingMode: 'hold' })
  assert.equal(s.lang, 'zh-HK')
  assert.equal(s.recordingMode, 'toggle')
})

test('sanitizeSettings 合法枚舉保留', () => {
  const s = sanitizeSettings({ lang: 'zh-CN', recordingMode: 'ptt' })
  assert.equal(s.lang, 'zh-CN')
  assert.equal(s.recordingMode, 'ptt')
})

test('sanitizeSettings 布林字串轉型', () => {
  const s = sanitizeSettings({
    polish: 'false',
    autoSend: 'true',
    noiseSuppression: 0,
    echoCancellation: 1,
  })
  assert.equal(s.polish, false)
  assert.equal(s.autoSend, true)
  assert.equal(s.noiseSuppression, false)
  assert.equal(s.echoCancellation, true)
})

test('sanitizeSettings 空字串回退預設', () => {
  const s = sanitizeSettings({ hotkey: '', micDeviceId: '  ' })
  assert.equal(s.hotkey, DEFAULT_SETTINGS.hotkey)
  assert.equal(s.micDeviceId, DEFAULT_SETTINGS.micDeviceId)
})

test('sanitizeSettings 只回傳已知鍵、忽略未知鍵', () => {
  const s = sanitizeSettings({ lang: 'en', evilKey: 'x', engine: 'sherpa' })
  assert.equal(s.lang, 'en')
  assert.equal('evilKey' in s, false)
  assert.equal('engine' in s, false)
  assert.deepEqual(Object.keys(s).sort(), Object.keys(DEFAULT_SETTINGS).sort())
})

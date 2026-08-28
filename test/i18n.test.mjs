import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DICTS, pickDict, detectLocaleId } from '../src/core/i18n.js'

test('pickDict 依 locale 選字典', () => {
  assert.equal(pickDict('en'), DICTS.en)
  assert.equal(pickDict('zh'), DICTS.zh)
  assert.equal(pickDict('zh-CN'), DICTS.zh)
  assert.equal(pickDict(undefined), DICTS.zh)
})

test('detectLocaleId 字串與快照形狀', () => {
  assert.equal(detectLocaleId('en'), 'en')
  assert.equal(detectLocaleId('zh'), 'zh')
  assert.equal(detectLocaleId({ id: 'en' }), 'en')
  assert.equal(detectLocaleId({ locale: 'zh-CN' }), 'zh')
  assert.equal(detectLocaleId({ language: 'en-US' }), 'en')
  assert.equal(detectLocaleId({ language: 'zh-TW' }), 'zh')
  assert.equal(detectLocaleId(undefined), 'zh')
  assert.equal(detectLocaleId(null), 'zh')
})

test('zh/en 字典鍵集合一致', () => {
  const zhKeys = Object.keys(DICTS.zh).sort()
  const enKeys = Object.keys(DICTS.en).sort()
  assert.deepEqual(zhKeys, enKeys)
  assert.ok(zhKeys.length > 0)
})

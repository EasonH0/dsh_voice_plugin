import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeKey,
  isModifier,
  eventToken,
  sequenceToString,
  sequenceFromString,
  sequenceMatches,
  isEditableTarget,
  hotkeyLabel,
  createSequenceRecorder,
} from '../src/core/hotkey-sequence.js'

test('normalizeKey 歸一化修飾鍵左右變體', () => {
  assert.equal(normalizeKey('AltLeft'), 'Alt')
  assert.equal(normalizeKey('AltRight'), 'Alt')
  assert.equal(normalizeKey('ControlLeft'), 'Control')
  assert.equal(normalizeKey('ControlRight'), 'Control')
  assert.equal(normalizeKey('ShiftLeft'), 'Shift')
  assert.equal(normalizeKey('ShiftRight'), 'Shift')
  assert.equal(normalizeKey('MetaLeft'), 'Meta')
  assert.equal(normalizeKey('MetaRight'), 'Meta')
})

test('normalizeKey 普通鍵原樣保留、非字串回空字串', () => {
  assert.equal(normalizeKey('KeyM'), 'KeyM')
  assert.equal(normalizeKey('KeyC'), 'KeyC')
  assert.equal(normalizeKey(undefined), '')
  assert.equal(normalizeKey(null), '')
  assert.equal(normalizeKey(123), '')
})

test('isModifier 判斷修飾鍵', () => {
  assert.equal(isModifier('Alt'), true)
  assert.equal(isModifier('Control'), true)
  assert.equal(isModifier('Shift'), true)
  assert.equal(isModifier('Meta'), true)
  assert.equal(isModifier('KeyM'), false)
  assert.equal(isModifier(''), false)
})

test('eventToken 從事件取 code 並歸一化', () => {
  assert.equal(eventToken({ code: 'AltLeft' }), 'Alt')
  assert.equal(eventToken({ code: 'KeyV' }), 'KeyV')
  assert.equal(eventToken(undefined), '')
})

test('sequenceFromString 解析並歸一化', () => {
  assert.deepEqual(sequenceFromString('Alt+KeyM'), ['Alt', 'KeyM'])
  assert.deepEqual(sequenceFromString('AltLeft+KeyM'), ['Alt', 'KeyM'])
  assert.deepEqual(sequenceFromString(' KeyC + KeyV + KeyB + KeyN '), ['KeyC', 'KeyV', 'KeyB', 'KeyN'])
  assert.deepEqual(sequenceFromString(''), [])
  assert.deepEqual(sequenceFromString('+'), [])
  assert.deepEqual(sequenceFromString(undefined), [])
})

test('sequenceToString 序列轉字串', () => {
  assert.equal(sequenceToString(['Alt', 'KeyM']), 'Alt+KeyM')
  assert.equal(sequenceToString([]), '')
  assert.equal(sequenceToString(undefined), '')
})

test('sequenceMatches 尾部匹配', () => {
  assert.equal(sequenceMatches(['Alt', 'KeyM'], ['Alt', 'KeyM']), true)
  assert.equal(sequenceMatches(['KeyX', 'Alt', 'KeyM'], ['Alt', 'KeyM']), true)
  assert.equal(sequenceMatches(['Alt', 'KeyM', 'KeyN'], ['Alt', 'KeyM']), false)
  assert.equal(sequenceMatches(['Alt'], ['Alt', 'KeyM']), false)
  assert.equal(sequenceMatches([], ['Alt', 'KeyM']), false)
  assert.equal(sequenceMatches(['Alt', 'KeyM'], []), false)
  assert.equal(sequenceMatches(['Alt', 'KeyM'], undefined), false)
})

test('hotkeyLabel 人類可讀標籤', () => {
  assert.equal(hotkeyLabel('Alt+KeyM'), 'Alt+M')
  assert.equal(hotkeyLabel('KeyC+KeyV+KeyB+KeyN'), 'C+V+B+N')
  assert.equal(hotkeyLabel('ControlLeft+Digit5'), 'Control+5')
  assert.equal(hotkeyLabel(''), '')
  assert.equal(hotkeyLabel('KeyM'), 'M')
})

test('isEditableTarget 偵測輸入框聚焦', () => {
  assert.equal(isEditableTarget({ tagName: 'INPUT' }), true)
  assert.equal(isEditableTarget({ tagName: 'TEXTAREA' }), true)
  assert.equal(isEditableTarget({ tagName: 'DIV', isContentEditable: true }), true)
  assert.equal(
    isEditableTarget({ tagName: 'SPAN', closest: () => ({}) }),
    true,
  )
  assert.equal(isEditableTarget({ tagName: 'SPAN', closest: () => null }), false)
  assert.equal(isEditableTarget({ tagName: 'DIV' }), false)
  assert.equal(isEditableTarget(undefined), false)
})

test('createSequenceRecorder 錄製多鍵序列後 Enter 完成', () => {
  const results = []
  const recorder = createSequenceRecorder({
    onDone: (seq, info) => results.push({ seq, info }),
  })
  assert.deepEqual(recorder.handleKeydown({ code: 'KeyC', repeat: false }), { done: false })
  assert.deepEqual(recorder.handleKeydown({ code: 'KeyV', repeat: false }), { done: false })
  assert.deepEqual(recorder.handleKeydown({ code: 'KeyB', repeat: false }), { done: false })
  assert.deepEqual(recorder.handleKeydown({ code: 'KeyN', repeat: false }), { done: false })
  const r = recorder.handleKeydown({ code: 'Enter', repeat: false })
  assert.equal(r.done, true)
  assert.deepEqual(r.seq, ['KeyC', 'KeyV', 'KeyB', 'KeyN'])
  assert.equal(results.length, 1)
  assert.deepEqual(results[0].seq, ['KeyC', 'KeyV', 'KeyB', 'KeyN'])
  assert.equal(results[0].info.canceled, false)
})

test('createSequenceRecorder 修飾鍵錄製歸一化', () => {
  const recorder = createSequenceRecorder({ onDone: () => {} })
  recorder.handleKeydown({ code: 'AltLeft', repeat: false })
  const r = recorder.handleKeydown({ code: 'Enter', repeat: false })
  assert.deepEqual(r.seq, ['Alt'])
})

test('createSequenceRecorder Esc 取消', () => {
  const results = []
  const recorder = createSequenceRecorder({
    onDone: (seq, info) => results.push({ seq, info }),
  })
  recorder.handleKeydown({ code: 'KeyC', repeat: false })
  const r = recorder.handleKeydown({ code: 'Escape', repeat: false })
  assert.equal(r.done, true)
  assert.equal(r.seq, null)
  assert.equal(results.length, 1)
  assert.equal(results[0].seq, null)
  assert.equal(results[0].info.canceled, true)
  assert.equal(results[0].info.reason, 'escape')
})

test('createSequenceRecorder 空序列 Enter 視為取消', () => {
  const results = []
  const recorder = createSequenceRecorder({
    onDone: (seq, info) => results.push({ seq, info }),
  })
  const r = recorder.handleKeydown({ code: 'Enter', repeat: false })
  assert.equal(r.done, true)
  assert.equal(r.seq, null)
  assert.equal(results[0].info.canceled, true)
  assert.equal(results[0].info.reason, 'empty')
})

test('createSequenceRecorder 忽略按住重複事件', () => {
  const recorder = createSequenceRecorder({ onDone: () => {} })
  recorder.handleKeydown({ code: 'KeyC', repeat: true })
  assert.deepEqual(recorder.snapshot(), [])
  const r = recorder.handleKeydown({ code: 'KeyC', repeat: false })
  assert.equal(r.done, false)
  assert.deepEqual(recorder.snapshot(), ['KeyC'])
})

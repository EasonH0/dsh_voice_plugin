import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mergeResults, createTranscriptStore } from '../src/core/draft.js'

test('mergeResults 單段 final', () => {
  const m = mergeResults([{ isFinal: true, transcript: '你好' }])
  assert.equal(m.finalText, '你好')
  assert.equal(m.interimText, '')
  assert.equal(m.combined, '你好')
})

test('mergeResults final 累積、interim 追加在後', () => {
  const m = mergeResults([
    { isFinal: true, transcript: '第一段。' },
    { isFinal: true, transcript: '第二段。' },
    { isFinal: false, transcript: '正在聽的' },
  ])
  assert.equal(m.finalText, '第一段。第二段。')
  assert.equal(m.interimText, '正在聽的')
  assert.equal(m.combined, '第一段。第二段。正在聽的')
})

test('mergeResults 空結果與髒資料', () => {
  assert.deepEqual(mergeResults([]), { finalText: '', interimText: '', combined: '' })
  assert.deepEqual(mergeResults(undefined), { finalText: '', interimText: '', combined: '' })
  assert.deepEqual(mergeResults([{ isFinal: true }, { isFinal: false, transcript: 123 }, null]), {
    finalText: '',
    interimText: '',
    combined: '',
  })
})

test('createTranscriptStore 全量重算與 reset', () => {
  const store = createTranscriptStore()
  store.onResults([{ isFinal: true, transcript: '完成。' }])
  assert.equal(store.snapshot(), '完成。')
  // Web Speech 每次 onresult 送全量 results：同一段從 interim 變 final 時不會重複
  store.onResults([
    { isFinal: true, transcript: '完成。' },
    { isFinal: false, transcript: '下一句' },
  ])
  assert.equal(store.snapshot(), '完成。下一句')
  store.onResults([{ isFinal: true, transcript: '完成。' }, { isFinal: true, transcript: '下一句。' }])
  assert.equal(store.snapshot(), '完成。下一句。')
  store.reset()
  assert.equal(store.snapshot(), '')
})

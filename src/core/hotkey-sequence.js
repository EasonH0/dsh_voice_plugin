// 快捷鍵序列核心邏輯（純函數，無 DOM 依賴）
//
// 序列 = 按鍵 code token 陣列，例如 ['Alt', 'KeyM']（順序感應）。
// 本模組同時被 host（ESM import）與 client（build 時拼入單檔）使用。

// KeyboardEvent.code 的修飾鍵是左右變體（AltLeft/AltRight 等），
// 比對前必須歸一化為 Alt/Control/Shift/Meta。
export function normalizeKey(code) {
  if (typeof code !== 'string') return ''
  if (code.startsWith('Alt')) return 'Alt'
  if (code.startsWith('Control')) return 'Control'
  if (code.startsWith('Shift')) return 'Shift'
  if (code.startsWith('Meta')) return 'Meta'
  return code
}

// 歸一化後是否為修飾鍵
export function isModifier(token) {
  return token === 'Alt' || token === 'Control' || token === 'Shift' || token === 'Meta'
}

// 事件 → token（用 code 而非 key：不受 CapsLock／Shift／輸入法狀態影響）
export function eventToken(eventLike) {
  return normalizeKey(eventLike && eventLike.code)
}

// 序列 → 字串（config 用 'Alt+KeyM' 形式）
export function sequenceToString(tokens) {
  return (tokens || []).join('+')
}

// 字串 → 序列（config 用 'Alt+KeyM' 形式）
export function sequenceFromString(str) {
  if (typeof str !== 'string') return []
  return str
    .split('+')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map(normalizeKey)
}

// 序列匹配：buffer 尾部是否等於 target（buffer 是累積的按鍵歷史）
export function sequenceMatches(buffer, target) {
  if (!Array.isArray(target) || target.length === 0) return false
  if (!Array.isArray(buffer) || buffer.length < target.length) return false
  const offset = buffer.length - target.length
  for (let i = 0; i < target.length; i++) {
    if (buffer[offset + i] !== target[i]) return false
  }
  return true
}

// 序列 → 人類可讀標籤（'Alt+KeyM' → 'Alt+M'，供按鈕 title 提示）
export function hotkeyLabel(str) {
  return sequenceFromString(str)
    .map((t) => {
      if (isModifier(t)) return t
      if (t.startsWith('Key')) return t.slice(3)
      if (t.startsWith('Digit')) return t.slice(5)
      return t
    })
    .join('+')
}

// 輸入框聚焦偵測：輸入框（INPUT/TEXTAREA/contentEditable）聚焦時不搶快捷鍵
export function isEditableTarget(target) {
  if (!target) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA') return true
  if (target.isContentEditable === true) return true
  if (typeof target.closest === 'function') {
    const el = target.closest('[contenteditable], [contenteditable="true"]')
    if (el) return true
  }
  return false
}

// 錄製器：依次按鍵追加序列；Enter 完成（序列非空）；Esc 取消。
// handleKeydown 回傳 { done, seq }；done 時經 onDone(seq|null, info) 通知。
// 按住不放的 keydown 會帶 repeat=true，必須忽略。
export function createSequenceRecorder({ onDone } = {}) {
  let tokens = []
  return {
    reset() {
      tokens = []
    },
    snapshot() {
      return tokens.slice()
    },
    handleKeydown(eventLike) {
      if (eventLike && eventLike.repeat) return { done: false }
      const code = eventLike && eventLike.code
      if (code === 'Enter') {
        const hasKeys = tokens.length > 0
        const seq = hasKeys ? tokens.slice() : null
        tokens = []
        if (typeof onDone === 'function') {
          onDone(seq, hasKeys ? { canceled: false, reason: 'complete' } : { canceled: true, reason: 'empty' })
        }
        return { done: true, seq }
      }
      if (code === 'Escape') {
        tokens = []
        if (typeof onDone === 'function') onDone(null, { canceled: true, reason: 'escape' })
        return { done: true, seq: null }
      }
      tokens.push(normalizeKey(code))
      return { done: false }
    },
  }
}

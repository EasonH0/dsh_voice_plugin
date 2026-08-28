// 草稿合併核心邏輯（純函數，無 DOM 依賴）
//
// Web Speech onresult 的 event.results 是「辨識段落」陣列：
// isFinal=true 的段落文字已確認（final 累積），
// isFinal=false 的段落是正在聽的 interim（追加在後）。
// 草稿 = final 累積文字 + interim 文字。

// results 形如 [{ isFinal, transcript }]
export function mergeResults(results) {
  let finalText = ''
  let interimText = ''
  for (const r of results || []) {
    if (!r || typeof r.transcript !== 'string') continue
    if (r.isFinal) finalText += r.transcript
    else interimText += r.transcript
  }
  return { finalText, interimText, combined: finalText + interimText }
}

// 轉寫狀態機：每次 onresults 全量重算（Web Speech 的 results 是累積全量），
// 以 merged.combined 作為輸入欄草稿。
export function createTranscriptStore() {
  let combined = ''
  return {
    onResults(results) {
      const merged = mergeResults(results)
      combined = merged.combined
      return merged
    },
    snapshot() {
      return combined
    },
    reset() {
      combined = ''
    },
  }
}

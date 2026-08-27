// polish.mjs — LLM 潤飾層：prompt 建構（純邏輯）；模型呼叫由注入的 adapter 完成。

// 潤飾目標：粵語口語轉錄 → 繁體中文書面語。
// 修正：同音／近音錯字、缺標點、斷句；不增刪語意、不改事實。
export const POLISH_SYSTEM_PROMPT = [
  '你是語音轉錄潤飾器。使用者以廣東話口語說話，內容可能夾雜英文與程式術語。',
  '請將轉錄文字修正為流暢的繁體中文書面語：',
  '1. 修正同音／近音錯字與語音辨識錯誤；',
  '2. 補上恰當的標點符號與斷句；',
  '3. 保留所有英文單詞、程式碼、專有名詞原樣；',
  '4. 保留原意與所有資訊，不增刪、不總結、不改寫語氣。',
  '只輸出潤飾後的文字，不要任何解釋、前言或引號。',
].join('\n');

// 建構送給模型的訊息；回傳 { system, user }。
export function buildPolishMessages(transcript) {
  const text = typeof transcript === 'string' ? transcript.trim() : '';
  return {
    system: POLISH_SYSTEM_PROMPT,
    user: text.length > 0 ? text : '（無內容）',
  };
}

// adapter 契約：async polishTranscript(transcript) → string（潤飾後文字）
// 若 adapter 拋錯，呼叫方應回退原始轉錄。

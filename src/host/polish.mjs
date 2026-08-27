// polish.mjs — LLM 潤飾層：prompt 建構（純邏輯）；模型呼叫由注入的 adapter 完成。

// 潤飾目標：粵語口語轉錄 → 書面語（語文跟隨 DSH 語言：zh → 繁體中文；en → 英文）。
// 修正：同音／近音錯字、缺標點、斷句；不增刪語意、不改事實。
export const POLISH_SYSTEM_PROMPTS = Object.freeze({
  zh: [
    '你是語音轉錄潤飾器。使用者以廣東話口語說話，內容可能夾雜英文與程式術語。',
    '請將轉錄文字修正為流暢的繁體中文書面語：',
    '1. 修正同音／近音錯字與語音辨識錯誤；',
    '2. 補上恰當的標點符號與斷句；',
    '3. 保留所有英文單詞、程式碼、專有名詞原樣；',
    '4. 保留原意與所有資訊，不增刪、不總結、不改寫語氣。',
    '只輸出潤飾後的文字，不要任何解釋、前言或引號。',
  ].join('\n'),
  en: [
    'You are a speech-transcript polisher. The user speaks Cantonese with occasional English and technical terms.',
    'Rewrite the transcript into fluent written English:',
    '1. Fix homophone errors and speech-recognition mistakes;',
    '2. Add proper punctuation and sentence breaks;',
    '3. Keep all code, identifiers, and technical terms intact;',
    '4. Preserve the original meaning and all information; do not add, remove, summarize, or change the tone.',
    'Output only the polished text, with no explanation, preamble, or quotes.',
  ].join('\n'),
});

export const POLISH_SYSTEM_PROMPT = POLISH_SYSTEM_PROMPTS.zh;

// 依 DSH 語言取 prompt（zh / en；其餘回退 zh）。
export function polishPromptForLocale(locale) {
  return POLISH_SYSTEM_PROMPTS[locale] ?? POLISH_SYSTEM_PROMPTS.zh;
}

// 建構送給模型的訊息；回傳 { system, user }。
export function buildPolishMessages(transcript, locale = 'zh') {
  const text = typeof transcript === 'string' ? transcript.trim() : '';
  return {
    system: polishPromptForLocale(locale),
    user: text.length > 0 ? text : '（無內容）',
  };
}

// adapter 契約：async polishTranscript(transcript, locale) → string（潤飾後文字）
// 若 adapter 拋錯，呼叫方應回退原始轉錄。

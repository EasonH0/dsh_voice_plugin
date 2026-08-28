// UI 文案字典（純函數，無 DOM 依賴）
//
// 決策 5：插件介面文字跟隨 DSH locale（zh 簡中／en）。
// 辨識語言（Web Speech lang）與 UI 語言是兩回事。

export const DICTS = {
  zh: {
    idle: '语音输入',
    listening: '正在听',
    clickToStop: '（点击停止）',
    clickToStart: '（点击开始）',
    polishing: '润色中…',
    pressAndHold: '（按住说话）',
    errorNotAllowed: '麦克风权限被拒绝，请在浏览器设置中允许麦克风访问',
    errorNoSpeech: '未检测到语音，请重试',
    errorUnsupported: '当前浏览器不支持语音识别（Web Speech），可改用键盘输入',
    errorGeneric: '语音输入出错',
    hotkeyHint: '快捷键：',
  },
  en: {
    idle: 'Voice input',
    listening: 'Listening',
    clickToStop: ' (click to stop)',
    clickToStart: ' (click to start)',
    polishing: 'Polishing…',
    pressAndHold: ' (hold to talk)',
    errorNotAllowed: 'Microphone permission denied. Please allow microphone access in browser settings',
    errorNoSpeech: 'No speech detected, please try again',
    errorUnsupported: 'This browser does not support speech recognition (Web Speech)',
    errorGeneric: 'Voice input error',
    hotkeyHint: 'Hotkey: ',
  },
}

// locale 快照 → 字典（en 以外一律 zh）
export function pickDict(localeId) {
  return localeId === 'en' ? DICTS.en : DICTS.zh
}

// 從各種形狀的 locale 快照偵測 id（防禦式：不同 DSH 版本的快照欄位可能不同）
export function detectLocaleId(snapshot) {
  if (!snapshot) return 'zh'
  if (typeof snapshot === 'string') return snapshot === 'en' ? 'en' : 'zh'
  const id = snapshot.id ?? snapshot.locale ?? snapshot.language
  return typeof id === 'string' && id.toLowerCase().startsWith('en') ? 'en' : 'zh'
}

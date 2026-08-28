// 設定 schema 核心邏輯（純函數，無 DOM 依賴）
//
// host 側由 cordis.patch.yml 行內 config 取得原始設定，經 RPC 下發 client。
// 兩端共用同一份 sanitize：補預設值、強制型別與枚舉，防止髒資料。

export const LANGS = ['zh-HK', 'zh-CN', 'en']
export const RECORDING_MODES = ['toggle', 'ptt']

export const DEFAULT_SETTINGS = Object.freeze({
  // Web Speech 辨識語言（粵語預設，跟隨主人）
  lang: 'zh-HK',
  // 錄音模式：toggle 點擊開始/停止；ptt 按住說
  recordingMode: 'toggle',
  // 快捷鍵序列（'Alt+KeyM' 形式，順序感應）
  hotkey: 'Alt+KeyM',
  // 備用快捷鍵（開始/停止）
  hotkeyAlt: 'Alt+KeyV',
  // LLM 潤色：修同音錯字、補標點、粵語口語→書面語
  polish: true,
  // 轉寫完成後自動發送
  autoSend: false,
  // 關麥後立即停止輸出（必須先關錄音資源再清狀態）
  stopOnMute: false,
  // 降噪（瀏覽器 WebRTC 語音處理）
  noiseSuppression: true,
  // 回音消除（無回音環境慎開，開了會斷斷續續）
  echoCancellation: false,
  // 自動增益（自動放大輕聲收音）
  autoGainControl: true,
  // 監聽開關：即時聽到麥克風輸入
  listen: false,
  // 麥克風裝置 id（空 = 系統預設）
  micDeviceId: '',
  // 潤色模型：'follow' = 跟隨 DSH 會話模型
  polishProvider: 'follow',
  polishModel: 'follow',
})

function asBoolean(value, fallback) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') return value === 'true' || value === '1'
  if (typeof value === 'number') return value !== 0
  return fallback
}

function asString(value, fallback) {
  if (typeof value !== 'string') return fallback
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : fallback
}

function asEnum(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback
}

// 合併未知來源設定：補預設、強制型別與枚舉、只回傳已知鍵
export function sanitizeSettings(raw) {
  const src = raw && typeof raw === 'object' ? raw : {}
  return {
    lang: asEnum(src.lang, LANGS, DEFAULT_SETTINGS.lang),
    recordingMode: asEnum(src.recordingMode, RECORDING_MODES, DEFAULT_SETTINGS.recordingMode),
    hotkey: asString(src.hotkey, DEFAULT_SETTINGS.hotkey),
    hotkeyAlt: asString(src.hotkeyAlt, DEFAULT_SETTINGS.hotkeyAlt),
    polish: asBoolean(src.polish, DEFAULT_SETTINGS.polish),
    autoSend: asBoolean(src.autoSend, DEFAULT_SETTINGS.autoSend),
    stopOnMute: asBoolean(src.stopOnMute, DEFAULT_SETTINGS.stopOnMute),
    noiseSuppression: asBoolean(src.noiseSuppression, DEFAULT_SETTINGS.noiseSuppression),
    echoCancellation: asBoolean(src.echoCancellation, DEFAULT_SETTINGS.echoCancellation),
    autoGainControl: asBoolean(src.autoGainControl, DEFAULT_SETTINGS.autoGainControl),
    listen: asBoolean(src.listen, DEFAULT_SETTINGS.listen),
    micDeviceId: asString(src.micDeviceId, DEFAULT_SETTINGS.micDeviceId),
    polishProvider: asString(src.polishProvider, DEFAULT_SETTINGS.polishProvider),
    polishModel: asString(src.polishModel, DEFAULT_SETTINGS.polishModel),
  }
}

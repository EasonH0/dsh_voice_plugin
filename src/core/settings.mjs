// settings.mjs — 設定 schema、預設值、驗證與正規化（平台無關純邏輯）

export const ENGINE_IDS = Object.freeze(['sherpa', 'whisper']);
export const RECORD_MODES = Object.freeze(['toggle', 'ptt']);

export const DEFAULT_HOTKEYS = Object.freeze({
  toggle: 'Alt+KeyM',
  ptt: 'Alt+KeyV',
});

export const DEFAULTS = Object.freeze({
  engine: 'sherpa',
  inputDeviceId: '',
  recordMode: 'toggle',
  noiseSuppression: true,
  echoCancellation: true,
  autoGainControl: true,
  monitor: false,
  polish: true,
  autoSend: false,
  hotkeys: DEFAULT_HOTKEYS,
});

const BOOLEAN_KEYS = Object.freeze([
  'noiseSuppression',
  'echoCancellation',
  'autoGainControl',
  'monitor',
  'polish',
  'autoSend',
]);

// 驗證單一鍵值，合法回傳正規化後的值，非法回傳 undefined。
export function validateSetting(key, value) {
  switch (key) {
    case 'engine':
      return ENGINE_IDS.includes(value) ? value : undefined;
    case 'recordMode':
      return RECORD_MODES.includes(value) ? value : undefined;
    case 'inputDeviceId':
      return typeof value === 'string' ? value : undefined;
    case 'hotkeys': {
      const h = normalizeHotkeys(value);
      return h && h.toggle && h.ptt ? h : undefined;
    }
    default:
      if (BOOLEAN_KEYS.includes(key)) {
        return typeof value === 'boolean' ? value : undefined;
      }
      return undefined;
  }
}

// 只接受字串型快捷鍵（如 'Alt+KeyM'），缺項補預設。
export function normalizeHotkeys(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const toggle =
    typeof src.toggle === 'string' && src.toggle.length > 0
      ? src.toggle
      : DEFAULT_HOTKEYS.toggle;
  const ptt =
    typeof src.ptt === 'string' && src.ptt.length > 0 ? src.ptt : DEFAULT_HOTKEYS.ptt;
  return { toggle, ptt };
}

// 合併 user settings 與預設值；未知鍵丟棄、非法值回退預設。
export function normalizeSettings(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const out = { ...DEFAULTS, hotkeys: { ...DEFAULT_HOTKEYS } };
  for (const [key, value] of Object.entries(src)) {
    if (key === 'hotkeys') {
      out.hotkeys = normalizeHotkeys(value);
      continue;
    }
    const normalized = validateSetting(key, value);
    if (normalized !== undefined) out[key] = normalized;
  }
  return out;
}

// 完整深比較兩個設定（用於確認變更）。
export function settingsEqual(a, b) {
  const na = normalizeSettings(a);
  const nb = normalizeSettings(b);
  return (
    Object.keys(na).every((k) =>
      k === 'hotkeys'
        ? na.hotkeys.toggle === nb.hotkeys.toggle && na.hotkeys.ptt === nb.hotkeys.ptt
        : na[k] === nb[k],
    ) &&
    Object.keys(nb).every((k) =>
      k === 'hotkeys'
        ? nb.hotkeys.toggle === na.hotkeys.toggle && nb.hotkeys.ptt === na.hotkeys.ptt
        : nb[k] === na[k],
    )
  );
}

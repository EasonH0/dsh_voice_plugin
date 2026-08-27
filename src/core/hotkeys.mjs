// hotkeys.mjs — 頁面內快捷鍵：任意數量按鍵序列（順序感應、弦式觸發）

const MOD_KEYS = Object.freeze(['ctrl', 'alt', 'shift', 'meta']);

// 可綁定的一般按鍵（KeyboardEvent.code 命名法，大小寫不敏感輸入、正規化輸出）
const EXTRA_CODES = Object.freeze([
  'Backquote', 'Minus', 'Equal', 'BracketLeft', 'BracketRight', 'Backslash',
  'Semicolon', 'Quote', 'Comma', 'Period', 'Slash', 'Space', 'Enter', 'Tab',
  'Home', 'End', 'PageUp', 'PageDown', 'Insert', 'Delete',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
]);

// 修飾鍵的 KeyboardEvent.code 左右變體 → 統一 token
const MOD_VARIANTS = Object.freeze({
  AltLeft: 'Alt',
  AltRight: 'Alt',
  ControlLeft: 'Control',
  ControlRight: 'Control',
  ShiftLeft: 'Shift',
  ShiftRight: 'Shift',
  MetaLeft: 'Meta',
  MetaRight: 'Meta',
});

// 修飾鍵統一 token（KeyboardEvent 標準名）＋左右變體
const MOD_TOKEN_MAP = Object.freeze({
  ctrl: 'Control',
  alt: 'Alt',
  shift: 'Shift',
  meta: 'Meta',
  altleft: 'Alt',
  altright: 'Alt',
  controlleft: 'Control',
  controlright: 'Control',
  shiftleft: 'Shift',
  shiftright: 'Shift',
  metaleft: 'Meta',
  metaright: 'Meta',
});

// 單一段（鍵或修飾鍵）→ 標準 token；非法回 null
function normalizeToken(part) {
  const lower = String(part).toLowerCase().trim();
  if (MOD_TOKEN_MAP[lower]) {
    return MOD_TOKEN_MAP[lower];
  }
  const std = String(part).match(/^(key)([a-z])$/i) ?? String(part).match(/^(digit)([0-9])$/i) ?? String(part).match(/^(f)([1-9]|1[0-2])$/i);
  if (std) {
    const kind = std[1][0].toUpperCase() + std[1].slice(1).toLowerCase();
    return kind === 'F' ? kind + std[2] : kind + std[2].toUpperCase();
  }
  const extra = EXTRA_CODES.find((c) => c.toLowerCase() === lower);
  return extra ?? null;
}

// 'Alt+KeyM+KeyV' → ['Alt', 'KeyM', 'KeyV'];非法回 null
export function parseHotkey(spec) {
  if (typeof spec !== 'string' || spec.trim().length === 0) return null;
  const parts = spec.split('+').map((p) => p.trim());
  if (parts.some((p) => p.length === 0)) return null;
  const out = [];
  for (const part of parts) {
    const token = normalizeToken(part);
    if (token === null) return null;
    out.push(token);
  }
  return out;
}

// ['Alt','KeyM','KeyV'] → 'Alt+KeyM+KeyV'
export function serializeHotkey(codes) {
  const list = Array.isArray(codes) ? codes : parseHotkey(codes);
  if (!list || list.length === 0) return '';
  return list.join('+');
}

// 一個 KeyboardEvent → token（忽略 repeat；合法鍵回 token、非法鍵回 null）
export function eventToToken(event) {
  if (!event || typeof event.code !== 'string') return null;
  if (event.repeat) return null;
  const mod = MOD_VARIANTS[event.code];
  if (mod) return mod;
  return normalizeToken(event.code);
}

// 滑動窗比對：buffer 的尾端（最近 n 個 token）是否恰等於目標序列
export function matchesKeySequence(buffer, target) {
  if (!Array.isArray(buffer) || !Array.isArray(target) || target.length === 0) return false;
  const n = target.length;
  if (buffer.length < n) return false;
  for (let i = 0; i < n; i++) {
    if (buffer[buffer.length - n + i] !== target[i]) return false;
  }
  return true;
}

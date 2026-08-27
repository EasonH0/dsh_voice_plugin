// hotkeys.mjs — 頁面內快捷鍵：解析、序列化與事件匹配（平台無關純邏輯）

const MOD_KEYS = Object.freeze(['ctrl', 'alt', 'shift', 'meta']);

// 可綁定的一般按鍵（KeyboardEvent.code 命名法，大小寫不敏感輸入、正規化輸出）
const EXTRA_CODES = Object.freeze([
  'Backquote', 'Minus', 'Equal', 'BracketLeft', 'BracketRight', 'Backslash',
  'Semicolon', 'Quote', 'Comma', 'Period', 'Slash', 'Space', 'Enter', 'Tab',
  'Home', 'End', 'PageUp', 'PageDown', 'Insert', 'Delete',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
]);

function normalizeCode(part) {
  const std = part.match(/^(key)([a-z])$/i) ?? part.match(/^(digit)([0-9])$/i) ?? part.match(/^(f)([1-9]|1[0-2])$/i);
  if (std) {
    const kind = std[1][0].toUpperCase() + std[1].slice(1).toLowerCase();
    return kind === 'F' ? kind + std[2] : kind + std[2].toUpperCase();
  }
  const extra = EXTRA_CODES.find((c) => c.toLowerCase() === part.toLowerCase());
  return extra ?? null;
}

// 'Ctrl+Shift+KeyM' → { ctrl, alt, shift, meta, code }
export function parseHotkey(spec) {
  if (typeof spec !== 'string' || spec.trim().length === 0) return null;
  const parts = spec.split('+').map((p) => p.trim());
  const mods = { ctrl: false, alt: false, shift: false, meta: false };
  let code = null;
  for (const part of parts) {
    const lower = part.toLowerCase();
    if (MOD_KEYS.includes(lower)) {
      mods[lower] = true;
    } else {
      const normalized = normalizeCode(part);
      if (normalized === null) return null;
      if (code !== null) return null;
      code = normalized;
    }
  }
  if (code === null) return null;
  return { ...mods, code };
}

export function serializeHotkey(hotkey) {
  const p = parseHotkey(typeof hotkey === 'string' ? hotkey : '');
  if (!p && typeof hotkey !== 'object') return '';
  const h = p ?? hotkey;
  const mods = MOD_KEYS.filter((m) => h[m]).map(
    (m) => m[0].toUpperCase() + m.slice(1),
  );
  return [...mods, h.code].join('+');
}

// 事件（KeyboardEvent 形狀）是否命中快捷鍵；僅按鍵本身與修飾鍵，忽略其他鍵。
export function matchesHotkey(event, hotkey) {
  const h = typeof hotkey === 'string' ? parseHotkey(hotkey) : hotkey;
  if (!h || !event || typeof event.code !== 'string') return false;
  return (
    event.code === h.code &&
    !!event.ctrlKey === h.ctrl &&
    !!event.altKey === h.alt &&
    !!event.shiftKey === h.shift &&
    !!event.metaKey === h.meta
  );
}

// chunker.mjs — 音訊分塊與 base64 編碼（平台無關純邏輯，自帶 base64 實作）

const B64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

// Uint8Array → base64（純 JS，瀏覽器與 Node 行為一致）
export function bytesToBase64(bytes) {
  let out = '';
  const len = bytes.length;
  for (let i = 0; i < len; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < len ? bytes[i + 1] : 0;
    const b2 = i + 2 < len ? bytes[i + 2] : 0;
    out += B64_ALPHABET[b0 >> 2];
    out += B64_ALPHABET[((b0 & 3) << 4) | (b1 >> 4)];
    out += i + 1 < len ? B64_ALPHABET[((b1 & 15) << 2) | (b2 >> 6)] : '=';
    out += i + 2 < len ? B64_ALPHABET[b2 & 63] : '=';
  }
  return out;
}

// base64 → Uint8Array
export function base64ToBytes(b64) {
  const clean = String(b64).replace(/[^A-Za-z0-9+/=]/g, '');
  const pad = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  const out = new Uint8Array(((clean.length / 4) * 3) - pad);
  let oi = 0;
  const table = new Int16Array(256).fill(-1);
  for (let i = 0; i < B64_ALPHABET.length; i++) table[B64_ALPHABET.charCodeAt(i)] = i;
  for (let i = 0; i < clean.length; i += 4) {
    const c0 = table[clean.charCodeAt(i)];
    const c1 = table[clean.charCodeAt(i + 1)];
    const c2 = clean[i + 2] === '=' ? -1 : table[clean.charCodeAt(i + 2)];
    const c3 = clean[i + 3] === '=' ? -1 : table[clean.charCodeAt(i + 3)];
    out[oi++] = (c0 << 2) | (c1 >> 4);
    if (c2 >= 0) out[oi++] = ((c1 & 15) << 4) | (c2 >> 2);
    if (c3 >= 0) out[oi++] = ((c2 & 3) << 6) | c3;
  }
  return out;
}

// Int16Array ↔ 位元組（little-endian，與 Web Audio 一致）
export function int16ToBytes(int16Array) {
  const out = new Uint8Array(int16Array.length * 2);
  for (let i = 0; i < int16Array.length; i++) {
    const v = int16Array[i];
    out[i * 2] = v & 0xff;
    out[i * 2 + 1] = (v >> 8) & 0xff;
  }
  return out;
}

export function bytesToInt16(bytes) {
  const len = bytes.length - (bytes.length % 2);
  const out = new Int16Array(len / 2);
  for (let i = 0; i < len; i += 2) {
    out[i / 2] = (bytes[i] | (bytes[i + 1] << 8)) << 16 >> 16;
  }
  return out;
}

export function int16ToBase64(int16Array) {
  return bytesToBase64(int16ToBytes(int16Array));
}

export function base64ToInt16(b64) {
  return bytesToInt16(base64ToBytes(b64));
}

// 產生一筆上傳分塊
export function buildChunk(seq, int16Array) {
  return { seq, b64: int16ToBase64(int16Array) };
}

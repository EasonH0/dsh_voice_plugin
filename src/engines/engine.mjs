// engine.mjs — IEngine 介面契約（平台無關）

// 所有引擎必須實作以下方法（同步或 async 皆可）：
//
// start({ sampleRate, language }) → { ok: true } | { ok: false, error }
//   開始一段新的辨識；language 目前固定 'yue'（粵・中・英混合）。
//
// push(int16Array) → { text, done: false }
//   推入一幀 PCM（16kHz・16bit・單聲道）；text 為「目前為止的累積全文」。
//
// end() → { text, done: true }
//   結束串流，沖洗剩餘緩衝，回傳完整轉錄（未潤飾）。
//
// reset()：中斷當前辨識，丟棄緩衝。
// dispose()：釋放資源（模型、暫存等）。

export const ENGINE_CONTRACT_METHODS = Object.freeze([
  'start',
  'push',
  'end',
  'reset',
  'dispose',
]);

export function validateEngine(instance) {
  if (!instance || typeof instance !== 'object') {
    return { ok: false, error: 'engine must be an object' };
  }
  const missing = ENGINE_CONTRACT_METHODS.filter((m) => typeof instance[m] !== 'function');
  if (missing.length > 0) {
    return { ok: false, error: `missing methods: ${missing.join(', ')}` };
  }
  return { ok: true };
}

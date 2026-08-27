// audio-utils.mjs — 音訊取樣轉換與音量計算（平台無關純邏輯）

// Int16 PCM ↔ Float32（-1..1）
export function int16ToFloat32(int16Array) {
  const out = new Float32Array(int16Array.length);
  for (let i = 0; i < int16Array.length; i++) {
    out[i] = int16Array[i] / 32768;
  }
  return out;
}

export function float32ToInt16(float32Array) {
  const out = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    out[i] = s < 0 ? s * 32768 : s * 32767;
  }
  return out;
}

// 計算 RMS 音量（0..1）；空輸入回 0。支援 Float32Array 與 Int16Array。
export function computeRms(samples) {
  if (!samples || samples.length === 0) return 0;
  let sum = 0;
  const factor = samples instanceof Int16Array ? 1 / 32768 : 1;
  for (let i = 0; i < samples.length; i++) {
    const v = samples[i] * factor;
    sum += v * v;
  }
  return Math.sqrt(sum / samples.length);
}

// 換算 dBFS；rms 為 0 時回 -Infinity。
export function dbFromRms(rms) {
  return 20 * Math.log10(rms);
}

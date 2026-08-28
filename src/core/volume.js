// 音量計算核心邏輯（純函數，無 DOM 依賴）
//
// samples 為 ArrayLike<number>（Float32Array 等，樣本範圍約 -1..1）。

// RMS（均方根）音量，空輸入回傳 0
export function computeRMS(samples) {
  if (!samples || samples.length === 0) return 0
  let sum = 0
  for (let i = 0; i < samples.length; i++) {
    const v = Number(samples[i]) || 0
    sum += v * v
  }
  return Math.sqrt(sum / samples.length)
}

// RMS → 0..100 百分比（線性映射＋clamp；max 預設 1 對應樣本滿幅）
export function rmsToPercent(rms, { min = 0, max = 1 } = {}) {
  if (!(rms >= 0)) return 0
  const span = max - min
  if (span <= 0) return 0
  const t = (rms - min) / span
  const clamped = t < 0 ? 0 : t > 1 ? 1 : t
  return Math.round(clamped * 100)
}

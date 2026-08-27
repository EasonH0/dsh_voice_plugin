// mock-engine.mjs — 零依賴模擬引擎：以可控節奏吐出預設文字，模擬串流辨識行為。

// 用途：單元測試、動態 Plugin 原型驗證（安裝真實引擎前跑通全鏈路）。
// 行為契約與 SherpaEngine 一致：push 回累積文字、end 沖洗完全文。
export class MockEngine {
  // options: { script, charsPerChunk, delayChunks }
  constructor(options = {}) {
    this.script = options.script ?? '這是模擬辨識結果';
    this.charsPerChunk = options.charsPerChunk ?? 3;
    this.delayChunks = options.delayChunks ?? 2;
    this.reset();
  }

  reset() {
    this.started = false;
    this.finished = false;
    this.chunksSeen = 0;
    this.emitted = 0;
  }

  start({ sampleRate } = {}) {
    if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
      return { ok: false, error: `invalid sampleRate: ${sampleRate}` };
    }
    this.reset();
    this.started = true;
    return { ok: true };
  }

  push(_pcm) {
    if (!this.started || this.finished) {
      return { text: '', done: false };
    }
    this.chunksSeen += 1;
    if (this.chunksSeen > this.delayChunks) {
      this.emitted = Math.min(
        this.script.length,
        this.emitted + this.charsPerChunk,
      );
    }
    return { text: this.script.slice(0, this.emitted), done: false };
  }

  end() {
    if (!this.started) return { text: '', done: true };
    this.finished = true;
    return { text: this.script, done: true };
  }

  dispose() {
    this.reset();
  }
}

export function createMockEngine(options) {
  return new MockEngine(options);
}

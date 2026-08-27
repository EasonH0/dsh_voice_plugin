// sherpa-engine.mjs — 真實語音辨識引擎：sherpa-onnx-node 串流三語模型（粵・中・英）
// 依 IEngine 契約（src/engines/engine.mjs）：start/push/end/reset/dispose。
// 依賴：npm 套件 sherpa-onnx-node（安裝階段）+ models/ 目錄內的模型檔案。

import { createRequire } from 'node:module';
import { join } from 'node:path';
import { int16ToFloat32 } from '../core/audio-utils.mjs';

const require = createRequire(import.meta.url);

const DEFAULT_MODEL_DIR = join(
  import.meta.dirname,
  '..',
  '..',
  'models',
  'sherpa-onnx-streaming-paraformer-trilingual-zh-cantonese-en',
);

export class SherpaEngine {
  // options: { modelDir, numThreads, sampleRate }
  constructor(options = {}) {
    this.modelDir = options.modelDir ?? DEFAULT_MODEL_DIR;
    this.numThreads = options.numThreads ?? 4;
    this.sampleRate = options.sampleRate ?? 16000;
    this.recognizer = null;
    this.stream = null;
    this.started = false;
    this.sherpa = null;
  }

  start({ sampleRate } = {}) {
    if (this.started && this.recognizer) return { ok: true };
    const sr = Number.isFinite(sampleRate) ? sampleRate : this.sampleRate;
    try {
      this.sherpa = require('sherpa-onnx-node');
      const config = {
        featConfig: { sampleRate: sr, featureDim: 80 },
        modelConfig: {
          paraformer: {
            encoder: join(this.modelDir, 'encoder.int8.onnx'),
            decoder: join(this.modelDir, 'decoder.int8.onnx'),
          },
          tokens: join(this.modelDir, 'tokens.txt'),
          numThreads: this.numThreads,
          provider: 'cpu',
          modelType: '',
        },
        decodingMethod: 'greedy_search',
        enableEndpoint: false, // 端點由使用者（關麥）控制，不自動結束
      };
      this.recognizer = new this.sherpa.OnlineRecognizer(config);
      this.stream = this.recognizer.createStream();
      this.started = true;
      return { ok: true };
    } catch (err) {
      this.started = false;
      this.recognizer = null;
      this.stream = null;
      return { ok: false, error: String((err && err.message) || err) };
    }
  }

  push(int16Array) {
    if (!this.started || !this.stream || !this.recognizer) {
      return { text: '', done: false };
    }
    this.stream.acceptWaveform({
      samples: int16ToFloat32(int16Array),
      sampleRate: this.sampleRate,
    });
    while (this.recognizer.isReady(this.stream)) {
      this.recognizer.decode(this.stream);
    }
    const res = this.recognizer.getResult(this.stream);
    return { text: res && typeof res.text === 'string' ? res.text : '', done: false };
  }

  end() {
    if (!this.started || !this.stream || !this.recognizer) {
      return { text: '', done: true };
    }
    this.stream.inputFinished();
    while (this.recognizer.isReady(this.stream)) {
      this.recognizer.decode(this.stream);
    }
    const res = this.recognizer.getResult(this.stream);
    const text = res && typeof res.text === 'string' ? res.text : '';
    this.dispose();
    return { text, done: true };
  }

  reset() {
    this.dispose();
  }

  dispose() {
    this.stream = null;
    this.recognizer = null;
    this.sherpa = null;
    this.started = false;
  }
}

export function createSherpaEngine(options) {
  return new SherpaEngine(options);
}

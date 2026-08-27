// whisper-engine.mjs — 第二辨識引擎：Whisper large-v3（transformers.js / ONNX Runtime）
// 高準確率、非串流（錄完整段後批次辨識）；中英混說與粵語辨識遠優於串流模型。
// 依 IEngine 契約（src/engines/engine.mjs）：start/push/end/reset/dispose。

import { pipeline, env } from '@xenova/transformers';
import { join } from 'node:path';
import { int16ToFloat32 } from '../core/audio-utils.mjs';

// 全本地：關閉遠端下載，只讀本機模型目錄（scripts/download-whisper-model.mjs 產出）
const MODELS_ROOT = join(import.meta.dirname, '..', '..', 'models');
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.useFSCache = false;
env.localModelPath = MODELS_ROOT; // transformers.js 會把相對模型名拼在此根目錄

const DEFAULT_MODEL_NAME = 'whisper-large-v3';

export class WhisperEngine {
  // options: { modelName, quantized, language, task }
  // quantized: true 使用量化版模型檔（download-whisper-model.mjs 下載的就是量化版）
  // language: null = 自動偵測；可指定 'zh' | 'yue' | 'en'。
  constructor(options = {}) {
    this.modelName = options.modelName ?? options.modelPath ?? DEFAULT_MODEL_NAME;
    this.quantized = options.quantized ?? true;
    this.language = options.language ?? null;
    this.task = options.task ?? 'transcribe';
    this.pipe = null;
    this.buffers = [];
    this.started = false;
  }

  async start({ sampleRate } = {}) {
    this.sampleRate = Number.isFinite(sampleRate) ? sampleRate : 16000;
    if (this.started && this.pipe) return { ok: true };
    try {
      this.pipe = await pipeline('automatic-speech-recognition', this.modelName, {
        quantized: this.quantized,
        progress_callback: null,
      });
    } catch (err) {
      return { ok: false, error: String((err && err.message) || err) };
    }
    this.buffers = [];
    this.started = true;
    return { ok: true };
  }

  push(int16Array) {
    if (!this.started) return { text: '', done: false };
    this.buffers.push(int16Array);
    return { text: '', done: false }; // 非串流：end 時一次過輸出
  }

  async end() {
    if (!this.started || !this.pipe) return { text: '', done: true };
    const total = this.buffers.reduce((n, b) => n + b.length, 0);
    const merged = new Int16Array(total);
    let offset = 0;
    for (const b of this.buffers) {
      merged.set(b, offset);
      offset += b.length;
    }
    const f32 = int16ToFloat32(merged);
    let text = '';
    try {
      const result = await this.pipe(f32, {
        language: this.language,
        task: this.task,
        chunk_length_s: 30,
        stride_length_s: 5,
      });
      text = result && typeof result.text === 'string' ? result.text.trim() : '';
    } catch (err) {
      this.dispose();
      return { text: '', done: true, error: String((err && err.message) || err) };
    }
    this.dispose();
    return { text, done: true };
  }

  reset() {
    this.dispose();
  }

  dispose() {
    this.buffers = [];
    this.started = false;
    // 保留 pipe 供重複使用（transformer 模型載入昂貴）
  }

  async release() {
    if (this.pipe && typeof this.pipe.dispose === 'function') {
      try { await this.pipe.dispose(); } catch (_) {}
    }
    this.pipe = null;
    this.dispose();
  }
}

export function createWhisperEngine(options) {
  return new WhisperEngine(options);
}

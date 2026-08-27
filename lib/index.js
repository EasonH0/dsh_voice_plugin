// lib/index.js — dsh-voice-input 正式插件：Host 半部
// 語音辨識全本地：sherpa-onnx 串流三語（低延遲）＋Whisper large-v3（高準確、中英混說）
// 缺模型自動降級 browser（Web Speech）兜底；LLM 潤飾走 DSH 會話模型。

import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { SherpaEngine } from './engines/sherpa-engine.mjs';
import { WhisperEngine } from './engines/whisper-engine.mjs';
import { base64ToBytes, bytesToInt16 } from './core/chunker.mjs';
import { polishPromptForLocale } from './host/polish.mjs';

export const name = 'dsh-voice-input-host';
export const inject = ['connection'];

const CHANNEL = '/voice-input';
const ENDPOINTS = {
  ping: 'ping',
  config: 'config',
  models: 'models',
  chunk: 'chunk',
  finalize: 'finalize',
  reset: 'reset',
};

export function apply(ctx, config = {}) {
  const logger = ctx.logger;
  const llm = ctx.get('llm');
  const agentDefaultModel = ctx.get('agentDefaultModel');

  const cfg = {
    engine: config.engine ?? 'auto',
    modelDir: typeof config.modelDir === 'string' ? config.modelDir.trim() : '',
    hotkey: typeof config.hotkey === 'string' && config.hotkey ? config.hotkey : 'Alt+KeyM',
    hotkeyAlt: typeof config.hotkeyAlt === 'string' && config.hotkeyAlt ? config.hotkeyAlt : 'Alt+KeyV',
    polish: config.polish !== false,
    autoSend: config.autoSend === true,
    noiseSuppression: config.noiseSuppression !== false,
    echoCancellation: config.echoCancellation === true,
    autoGainControl: config.autoGainControl !== false,
  };

  // 模型根目錄：config.modelDir 或預設 <cwd>/dsh-voice-input-models
  const modelRoot = cfg.modelDir || join(process.cwd(), 'dsh-voice-input-models');
  const sherpaDir = join(modelRoot, 'sherpa-onnx-streaming-paraformer-trilingual-zh-cantonese-en');
  const whisperDir = join(modelRoot, 'whisper-large-v3');

  let sherpa = null;
  let whisper = null;
  let active = null; // { engine: 'sherpa' | 'whisper', obj }
  let msgSeq = 0;

  // 模型存在性前置檢查：native 模組一旦載入崩潰會帶走整個 DSH 主機，
  // 因此模型檔不齊備時絕不碰 native 引擎，直接降級瀏覽器兜底。
  function hasSherpaModel() {
    return existsSync(join(sherpaDir, 'encoder.int8.onnx'))
      && existsSync(join(sherpaDir, 'decoder.int8.onnx'))
      && existsSync(join(sherpaDir, 'tokens.txt'));
  }
  function hasWhisperModel() {
    return existsSync(join(whisperDir, 'config.json'))
      && existsSync(join(whisperDir, 'onnx', 'encoder_model_quantized.onnx'))
      && existsSync(join(whisperDir, 'onnx', 'decoder_model_merged_quantized.onnx'));
  }

  async function loadSherpa() {
    if (!hasSherpaModel()) return null;
    if (!sherpa) sherpa = new SherpaEngine({ modelDir: sherpaDir, quantization: 'int8' });
    const r = await sherpa.start({ sampleRate: 16000 });
    return r.ok ? sherpa : null;
  }

  async function loadWhisper() {
    if (!hasWhisperModel()) return null;
    if (!whisper) whisper = new WhisperEngine({ modelName: 'whisper-large-v3', modelDir: modelRoot });
    const r = await whisper.start({ sampleRate: 16000 });
    return r.ok ? whisper : null;
  }

  async function effectiveEngine() {
    if (cfg.engine === 'sherpa') return (await loadSherpa()) ? 'sherpa' : 'browser';
    if (cfg.engine === 'whisper') return (await loadWhisper()) ? 'whisper' : 'browser';
    // auto：sherpa 優先（低延遲），其次 whisper，最後 browser 兜底
    if (await loadSherpa()) return 'sherpa';
    if (await loadWhisper()) return 'whisper';
    return 'browser';
  }

  function beginSession() {
    if (!active) return null;
    const r = active.obj.start({ sampleRate: 16000 });
    return r.ok ? active : null;
  }

  async function runPolish(transcript, locale) {
    if (!llm) throw new Error('llm service unavailable');
    let provider = '';
    let model = '';
    try {
      const sel = agentDefaultModel ? agentDefaultModel.currentSelection() : {};
      provider = sel && typeof sel.provider === 'string' ? sel.provider : '';
      model = sel && typeof sel.model === 'string' ? sel.model : '';
    } catch (_) {}
    if (!provider || !model) throw new Error('no provider/model configured');
    const messages = [{
      id: 'voice-polish-' + (++msgSeq),
      role: 'user',
      content: [{ type: 'text', text: transcript }],
      source: { kind: 'plugin', plugin: 'dsh-voice-input' },
    }];
    let out = '';
    for await (const chunk of llm.stream({
      provider,
      model,
      messages,
      system: polishPromptForLocale(locale),
      temperature: 0,
    })) {
      if (chunk && chunk.type === 'text-delta') out += chunk.text;
    }
    const trimmed = out.trim();
    return trimmed.length > 0 ? trimmed : transcript;
  }

  ctx.effect(() => ctx.connection.rpc.handle(CHANNEL, async (endpoint, payload) => {
    switch (endpoint) {
      case ENDPOINTS.ping: {
        return { ok: true, value: { engine: await effectiveEngine() } };
      }
      case ENDPOINTS.config: {
        return {
          ok: true,
          value: {
            engine: await effectiveEngine(),
            hotkey: cfg.hotkey,
            hotkeyAlt: cfg.hotkeyAlt,
            polish: cfg.polish,
            autoSend: cfg.autoSend,
            noiseSuppression: cfg.noiseSuppression,
            echoCancellation: cfg.echoCancellation,
            autoGainControl: cfg.autoGainControl,
          },
        };
      }
      case ENDPOINTS.models: {
        // 模型目錄狀態（下載工具與排查用）
        return { ok: true, value: { modelRoot, sherpaDir, whisperDir } };
      }
      case ENDPOINTS.chunk: {
        const engineName = await effectiveEngine();
        if (engineName === 'browser') return { ok: false, error: 'native_unavailable' };
        if (engineName === 'sherpa' && (!active || active.engine !== 'sherpa')) {
          active = { engine: 'sherpa', obj: await loadSherpa() };
        }
        if (engineName === 'whisper' && (!active || active.engine !== 'whisper')) {
          active = { engine: 'whisper', obj: await loadWhisper() };
        }
        if (!active || !active.obj) return { ok: false, error: 'native_unavailable' };
        if (!active.started) {
          const r = active.obj.start({ sampleRate: 16000 });
          if (!r.ok) return { ok: false, error: r.error };
        }
        try {
          const pcm = bytesToInt16(base64ToBytes(payload && payload.b64 ? payload.b64 : ''));
          const r = active.obj.push(pcm);
          return { ok: true, value: { text: r.text } };
        } catch (err) {
          return { ok: false, error: String((err && err.message) || err) };
        }
      }
      case ENDPOINTS.finalize: {
        if (!active || !active.obj) {
          // browser 引擎：client 已用 Web Speech 辨識，把文字送來潤飾
          let text = payload && typeof payload.text === 'string' ? payload.text : '';
          let polished = false;
          if (cfg.polish && text.length > 0) {
            try {
              const locale = payload && typeof payload.locale === 'string' ? payload.locale : 'zh';
              text = await runPolish(text, locale);
              polished = true;
            } catch (err) {
              logger.warn('voice-input: 潤飾失敗 %s', String(err));
            }
          }
          return { ok: true, value: { text, polished } };
        }
        let text = '';
        try {
          const r = await active.obj.end();
          text = r.text || '';
        } catch (err) {
          logger.warn('voice-input: finalize 失敗 %s', String(err));
        }
        let polished = false;
        if (cfg.polish && text.length > 0) {
          try {
            const locale = payload && typeof payload.locale === 'string' ? payload.locale : 'zh';
            text = await runPolish(text, locale);
            polished = true;
          } catch (err) {
            logger.warn('voice-input: 潤飾失敗 %s', String(err));
          }
        }
        return { ok: true, value: { text, polished } };
      }
      case ENDPOINTS.reset: {
        if (active && active.obj) {
          try { active.obj.reset(); } catch (_) {}
        }
        return { ok: true };
      }
      default:
        return { ok: false, error: 'unknown_endpoint: ' + endpoint };
    }
  }, { authority: 'loopback' }), 'dsh-voice-input: /voice-input rpc channel');
}

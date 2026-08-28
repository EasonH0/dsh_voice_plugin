// dsh-voice-input host 半（正式插件，ESM）
//
// 職責：/voice-input RPC 通道（ping/config/polish）。
// polish 用 DSH 會話模型做 LLM 潤飾（修同音錯字、補標點、粵語口語→書面語）。
// 無 native 依賴；本地引擎已按主人決策完全移除。
import { sanitizeSettings } from './core/settings.js';

export const name = 'dsh-voice-input';
export const inject = ['connection'];

const PLUGIN = 'dsh-voice-input';
const CHANNEL = '/voice-input';

// 潤飾 prompt（決策 5：zh → 繁體書面語；en → 英文）
const PROMPTS = {
  zh: '你是語音辨識文字潤飾器。把輸入的粵語口語轉成繁體中文書面語：修正同音錯字、補上標點與斷句、保留英文與專有名詞原樣、不增刪語意。只輸出潤飾後的文字，不要任何解釋或前言。',
  en: 'You are a speech transcript polisher. Fix homophone errors, add punctuation and sentence breaks, keep English and proper nouns intact, and preserve the meaning exactly. Output only the polished text, with no explanation or preamble.',
};

function polishSystem(locale) {
  return locale === 'en' ? PROMPTS.en : PROMPTS.zh;
}

// LLM 潤飾：跟隨 DSH 會話模型（決策 3）
async function polishText(ctx, text, locale) {
  const trimmed = typeof text === 'string' ? text.trim() : '';
  if (trimmed === '') return { text: '', error: null };
  const llm = ctx.get('llm');
  if (llm === undefined) {
    ctx.logger.warn('dsh-voice-input: llm 服務不可用，跳過潤飾');
    return { text: trimmed, error: 'llm_unavailable' };
  }
  let provider;
  let model;
  const agentDefaultModel = ctx.get('agentDefaultModel');
  if (agentDefaultModel !== undefined && typeof agentDefaultModel.currentSelection === 'function') {
    try {
      const sel = agentDefaultModel.currentSelection();
      if (sel && typeof sel.provider === 'string' && sel.provider !== '') provider = sel.provider;
      if (sel && typeof sel.model === 'string' && sel.model !== '') model = sel.model;
    } catch (err) {
      ctx.logger.warn('dsh-voice-input: 讀取會話模型失敗: %s', String(err));
    }
  }
  const messages = [
    {
      id: 'voice-polish-1',
      role: 'user',
      content: [{ type: 'text', text: trimmed }],
      source: { kind: 'plugin', plugin: PLUGIN },
    },
  ];
  let out = '';
  try {
    for await (const chunk of llm.stream({
      provider,
      model,
      messages,
      system: polishSystem(locale),
      temperature: 0,
    })) {
      if (chunk && chunk.type === 'text-delta' && typeof chunk.text === 'string') out += chunk.text;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    ctx.logger.warn('dsh-voice-input: LLM 潤飾失敗，回傳原文: %s', message);
    return { text: trimmed, error: message };
  }
  const polished = out.trim();
  return { text: polished === '' ? trimmed : polished, error: null };
}

export function apply(ctx, config) {
  // cordis.patch.yml 行內 config 只傳 host 半；client 半經 /voice-input.config 下發
  const settings = sanitizeSettings(config);
  const logger = ctx.logger;

  ctx.effect(() =>
    ctx.connection.rpc.handle(
      CHANNEL,
      async (endpoint, payload) => {
        switch (endpoint) {
          case 'ping': {
            return { ok: true, value: { name: PLUGIN, engine: 'webspeech' } };
          }
          case 'config': {
            return { ok: true, value: settings };
          }
          case 'polish': {
            const p = payload && typeof payload === 'object' ? payload : {};
            const result = await polishText(ctx, p.text, p.locale);
            return { ok: true, value: result };
          }
          default: {
            logger.warn('dsh-voice-input: unknown endpoint: %s', String(endpoint));
            return { ok: false, error: { code: 'unknown_endpoint', message: 'unknown endpoint: ' + String(endpoint) } };
          }
        }
      },
      { authority: 'loopback' },
    ),
    'dsh-voice-input: /voice-input rpc channel',
  );
}

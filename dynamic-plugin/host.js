// dynamic-plugin/host.js — 動態 Plugin 原型：Host 半部
// 辨識以 MockEngine 模擬（零安裝階段）；LLM 潤飾已接上 DSH 的 llm 服務（真潤飾）。

return {
  apply(ctx) {
    const llm = ctx.get('llm');
    const agentDefaultModel = ctx.get('agentDefaultModel');
    const credentials = ctx.get('credentials');

    // ---------- 內聯：設定 ----------
    const DEFAULT_HOTKEYS = { toggle: 'Alt+KeyM', ptt: 'Alt+KeyV' };
    const DEFAULTS = {
      engine: 'sherpa',
      inputDeviceId: '',
      recordMode: 'toggle',
      noiseSuppression: true,
      echoCancellation: false,
      autoGainControl: true,
      monitor: false,
      polish: true,
      polishProvider: '',
      polishModel: '',
      autoSend: false,
      stopOnMicOff: false,
      hotkeys: { ...DEFAULT_HOTKEYS },
    };
    const ENGINE_IDS = ['sherpa', 'whisper'];
    const RECORD_MODES = ['toggle', 'ptt'];

    function normalizeHotkeys(raw) {
      const src = raw && typeof raw === 'object' ? raw : {};
      const toggle = typeof src.toggle === 'string' && src.toggle.length > 0 ? src.toggle : DEFAULT_HOTKEYS.toggle;
      const ptt = typeof src.ptt === 'string' && src.ptt.length > 0 ? src.ptt : DEFAULT_HOTKEYS.ptt;
      return { toggle, ptt };
    }
    function normalizeSettings(raw) {
      const src = raw && typeof raw === 'object' ? raw : {};
      const out = { ...DEFAULTS, hotkeys: { ...DEFAULT_HOTKEYS } };
      for (const [key, value] of Object.entries(src)) {
        if (key === 'hotkeys') { out.hotkeys = normalizeHotkeys(value); continue; }
        if (key === 'engine' && ENGINE_IDS.includes(value)) out.engine = value;
        else if (key === 'recordMode' && RECORD_MODES.includes(value)) out.recordMode = value;
        else if ((key === 'inputDeviceId' || key === 'polishProvider' || key === 'polishModel') && typeof value === 'string') out[key] = value;
        else if (['noiseSuppression', 'echoCancellation', 'autoGainControl', 'monitor', 'polish', 'autoSend', 'stopOnMicOff'].includes(key) && typeof value === 'boolean') out[key] = value;
      }
      return out;
    }

    // ---------- 內聯：base64 解碼（Int16 PCM） ----------
    const B64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    function base64ToBytes(b64) {
      const clean = String(b64).replace(/[^A-Za-z0-9+/=]/g, '');
      const pad = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
      const out = new Uint8Array(((clean.length / 4) * 3) - pad);
      const table = new Int16Array(256).fill(-1);
      for (let i = 0; i < B64_ALPHABET.length; i++) table[B64_ALPHABET.charCodeAt(i)] = i;
      let oi = 0;
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
    function bytesToInt16(bytes) {
      const len = bytes.length - (bytes.length % 2);
      const out = new Int16Array(len / 2);
      for (let i = 0; i < len; i += 2) {
        out[i / 2] = (bytes[i] | (bytes[i + 1] << 8)) << 16 >> 16;
      }
      return out;
    }

    // ---------- 內聯：MockEngine（契約與 src/engines/mock-engine.mjs 一致） ----------
    const DEFAULT_SCRIPT = '主人講嘅嘢已經變成文字喇，你嘅語音輸入插件原型運作正常。';
    class MockEngine {
      constructor(options = {}) {
        this.script = options.script ?? DEFAULT_SCRIPT;
        this.charsPerChunk = options.charsPerChunk ?? 2;
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
          return { ok: false, error: 'invalid sampleRate' };
        }
        this.reset();
        this.started = true;
        return { ok: true };
      }
      push(_pcm) {
        if (!this.started || this.finished) return { text: '', done: false };
        this.chunksSeen += 1;
        if (this.chunksSeen > this.delayChunks) {
          this.emitted = Math.min(this.script.length, this.emitted + this.charsPerChunk);
        }
        return { text: this.script.slice(0, this.emitted), done: false };
      }
      end() {
        if (!this.started) return { text: '', done: true };
        this.finished = true;
        return { text: this.script, done: true };
      }
      dispose() { this.reset(); }
    }

    // ---------- 內聯：潤飾 prompt（與 src/host/polish.mjs 一致） ----------
    const POLISH_PROMPTS = {
      zh: [
        '你是語音轉錄潤飾器。使用者以廣東話口語說話，內容可能夾雜英文與程式術語。',
        '請將轉錄文字修正為流暢的繁體中文書面語：',
        '1. 修正同音／近音錯字與語音辨識錯誤；',
        '2. 補上恰當的標點符號與斷句；',
        '3. 保留所有英文單詞、程式碼、專有名詞原樣；',
        '4. 保留原意與所有資訊，不增刪、不總結、不改寫語氣。',
        '只輸出潤飾後的文字，不要任何解釋、前言或引號。',
      ].join('\n'),
      en: [
        'You are a speech-transcript polisher. The user speaks Cantonese with occasional English and technical terms.',
        'Rewrite the transcript into fluent written English:',
        '1. Fix homophone errors and speech-recognition mistakes;',
        '2. Add proper punctuation and sentence breaks;',
        '3. Keep all code, identifiers, and technical terms intact;',
        '4. Preserve the original meaning and all information; do not add, remove, summarize, or change the tone.',
        'Output only the polished text, with no explanation, preamble, or quotes.',
      ].join('\n'),
    };
    function polishPromptForLocale(locale) {
      return POLISH_PROMPTS[locale] ?? POLISH_PROMPTS.zh;
    }

    // ---------- 狀態 ----------
    let settings = { ...DEFAULTS, hotkeys: { ...DEFAULT_HOTKEYS } };
    let engine = new MockEngine();
    let active = false;
    let msgSeq = 0;

    // ---------- 潤飾執行（用 DSH 的 llm 服務；key 由 adapter 依所選 provider 自動使用） ----------
    async function runPolish(transcript, locale) {
      if (!llm) throw new Error('llm service unavailable');
      let provider = settings.polishProvider;
      let model = settings.polishModel;
      if (!provider || !model) {
        const sel = agentDefaultModel ? agentDefaultModel.currentSelection() : {};
        if (!provider) provider = sel.provider;
        if (!model) model = sel.model;
      }
      if (!provider || !model) throw new Error('no provider/model configured');
      const messages = [{
        id: 'voice-polish-' + (++msgSeq),
        role: 'user',
        content: [{ type: 'text', text: transcript }],
        source: { kind: 'plugin', plugin: 'dsh_voice_plugin' },
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

    // ---------- RPC ----------
    harness.handle('settings.get', () => settings);

    harness.handle('settings.update', (args) => {
      settings = normalizeSettings(args ?? {});
      return settings;
    });

    // DSH 已有的 provider（= 已配置 API key 的路由）、預設模型、已存憑證清單（不含值）
    harness.handle('llm.catalog', async () => {
      const providers = llm ? llm.listProviders().map((p) => ({ id: p.id, name: p.name })) : [];
      let defaultProvider = '';
      let defaultModel = '';
      try {
        if (agentDefaultModel) {
          const sel = agentDefaultModel.currentSelection();
          if (sel && typeof sel.provider === 'string') {
            defaultProvider = sel.provider;
            defaultModel = typeof sel.model === 'string' ? sel.model : '';
          }
        }
      } catch (_) {}
      let records = [];
      if (credentials) {
        try {
          const list = await credentials.listRecords();
          records = (list ?? []).map((entry) => ({
            key: entry && typeof entry.key === 'string' ? entry.key : JSON.stringify(entry && entry.key),
            kind: entry && entry.kind ? String(entry.kind) : null,
          }));
        } catch (_) {}
      }
      return { providers, defaultProvider, defaultModel, records };
    });

    harness.handle('llm.models', async (args) => {
      if (!llm || !args || typeof args.provider !== 'string' || args.provider.length === 0) return [];
      try {
        const list = await llm.listModels(args.provider);
        return (list ?? []).map((m) => ({ id: m.id, name: m.name ?? m.id }));
      } catch (_) {
        return [];
      }
    });

    harness.handle('voice.begin', (args) => {
      const a = args ?? {};
      engine = new MockEngine({
        script: typeof a.script === 'string' && a.script.length > 0 ? a.script : DEFAULT_SCRIPT,
        charsPerChunk: Number.isFinite(a.charsPerChunk) ? a.charsPerChunk : 2,
        delayChunks: Number.isFinite(a.delayChunks) ? a.delayChunks : 2,
      });
      const r = engine.start({ sampleRate: a.sampleRate ?? 16000 });
      active = r.ok;
      return { ok: r.ok, error: r.error ?? null };
    });

    harness.handle('voice.chunk', (args) => {
      if (!active || !args || typeof args.b64 !== 'string') {
        return { text: '', done: false };
      }
      const r = engine.push(bytesToInt16(base64ToBytes(args.b64)));
      return { text: r.text, done: r.done };
    });

    harness.handle('voice.end', async (args) => {
      if (!active) return { text: '', polished: false, done: true };
      const r = engine.end();
      active = false;
      let text = r.text;
      let polished = false;
      const a = args ?? {};
      if (settings.polish && text.length > 0) {
        try {
          text = await runPolish(text, a.locale ?? 'zh');
          polished = true;
        } catch (err) {
          console.error('voice polish failed:', String((err && err.message) || err));
        }
      }
      return { text, polished, done: true };
    });

    harness.handle('voice.reset', () => {
      engine.reset();
      active = false;
      return { ok: true };
    });

    harness.handle('voice.ping', () => ({ ok: true }));
  },
};

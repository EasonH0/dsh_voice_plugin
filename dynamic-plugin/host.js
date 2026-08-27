// dynamic-plugin/host.js — 動態 Plugin 原型：Host 半部
// 開發階段以 MockEngine 模擬辨識引擎（零安裝）；真實引擎於安裝階段接上。
// 此檔案與 src/engines、src/core 的契約一致，動態環境禁止 import，故核心函數內聯。

return {
  apply(ctx) {
    // ---------- 內聯：設定 ----------
    const DEFAULT_HOTKEYS = { toggle: 'Alt+KeyM', ptt: 'Alt+KeyV' };
    const DEFAULTS = {
      engine: 'sherpa',
      inputDeviceId: '',
      recordMode: 'toggle',
      noiseSuppression: true,
      echoCancellation: true,
      autoGainControl: true,
      monitor: false,
      polish: true,
      autoSend: false,
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
        else if (key === 'inputDeviceId' && typeof value === 'string') out.inputDeviceId = value;
        else if (['noiseSuppression', 'echoCancellation', 'autoGainControl', 'monitor', 'polish', 'autoSend'].includes(key) && typeof value === 'boolean') out[key] = value;
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

    // ---------- 狀態 ----------
    let settings = { ...DEFAULTS, hotkeys: { ...DEFAULT_HOTKEYS } };
    let engine = new MockEngine();
    let active = false;

    // ---------- RPC ----------
    harness.handle('settings.get', () => settings);

    harness.handle('settings.update', (args) => {
      settings = normalizeSettings(args ?? {});
      return settings;
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

    harness.handle('voice.end', () => {
      if (!active) return { text: '', polished: false, done: true };
      const r = engine.end();
      active = false;
      // 潤飾層：原型階段 noop（正式版接 llm 服務）；回傳 polished=false 供 UI 標示
      return { text: r.text, polished: false, done: true };
    });

    harness.handle('voice.reset', () => {
      engine.reset();
      active = false;
      return { ok: true };
    });

    harness.handle('voice.ping', () => ({ ok: true }));
  },
};

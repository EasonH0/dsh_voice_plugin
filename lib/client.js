// lib/client.js — dsh-voice-input 正式插件：Client bundle（DSH module-loader 格式）
// 麥克風按鈕（conversation.input.right）＋錄音管線＋頁面內快捷鍵序列＋串流文字寫入輸入欄。
// 設定走 profile 的 cordis.patch.yml（host /voice-input.config 下發）。
window.__ModuleLoader__.load({
  id: 'dsh-voice-input',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    const { jsx } = require('react/jsx-runtime');

    // ---------- 內聯：快捷鍵序列（與 src/core/hotkeys.mjs 一致） ----------
    const MOD_TOKEN_MAP = { ctrl: 'Control', alt: 'Alt', shift: 'Shift', meta: 'Meta', altleft: 'Alt', altright: 'Alt', controlleft: 'Control', controlright: 'Control', shiftleft: 'Shift', shiftright: 'Shift', metaleft: 'Meta', metaright: 'Meta' };
    const EXTRA_CODES = ['Backquote', 'Minus', 'Equal', 'BracketLeft', 'BracketRight', 'Backslash', 'Semicolon', 'Quote', 'Comma', 'Period', 'Slash', 'Space', 'Enter', 'Tab', 'Home', 'End', 'PageUp', 'PageDown', 'Insert', 'Delete', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
    function normalizeToken(part) {
      const lower = String(part).toLowerCase().trim();
      if (MOD_TOKEN_MAP[lower]) return MOD_TOKEN_MAP[lower];
      const std = String(part).match(/^(key)([a-z])$/i) ?? String(part).match(/^(digit)([0-9])$/i) ?? String(part).match(/^(f)([1-9]|1[0-2])$/i);
      if (std) {
        const kind = std[1][0].toUpperCase() + std[1].slice(1).toLowerCase();
        return kind === 'F' ? kind + std[2] : kind + std[2].toUpperCase();
      }
      const extra = EXTRA_CODES.find((c) => c.toLowerCase() === lower);
      return extra ?? null;
    }
    function parseHotkey(spec) {
      if (typeof spec !== 'string' || spec.trim().length === 0) return null;
      const parts = spec.split('+').map((p) => p.trim());
      if (parts.some((p) => p.length === 0)) return null;
      const out = [];
      for (const part of parts) {
        const token = normalizeToken(part);
        if (token === null) return null;
        out.push(token);
      }
      return out;
    }
    function eventToToken(event) {
      if (!event || typeof event.code !== 'string') return null;
      if (event.repeat) return null;
      return normalizeToken(event.code);
    }
    function matchesKeySequence(buffer, target) {
      if (!Array.isArray(buffer) || !Array.isArray(target) || target.length === 0) return false;
      const n = target.length;
      if (buffer.length < n) return false;
      for (let i = 0; i < n; i++) {
        if (buffer[buffer.length - n + i] !== target[i]) return false;
      }
      return true;
    }

    // ---------- 內聯：音訊工具 ----------
    function computeRmsFloat(f32) {
      if (!f32 || f32.length === 0) return 0;
      let sum = 0;
      for (let i = 0; i < f32.length; i++) sum += f32[i] * f32[i];
      return Math.sqrt(sum / f32.length);
    }
    function float32ToInt16(f32) {
      const out = new Int16Array(f32.length);
      for (let i = 0; i < f32.length; i++) {
        const s = Math.max(-1, Math.min(1, f32[i]));
        out[i] = s < 0 ? s * 32768 : s * 32767;
      }
      return out;
    }
    const B64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    function bytesToBase64(bytes) {
      let out = '';
      const len = bytes.length;
      for (let i = 0; i < len; i += 3) {
        const b0 = bytes[i];
        const b1 = i + 1 < len ? bytes[i + 1] : 0;
        const b2 = i + 2 < len ? bytes[i + 2] : 0;
        out += B64_ALPHABET[b0 >> 2];
        out += B64_ALPHABET[((b0 & 3) << 4) | (b1 >> 4)];
        out += i + 1 < len ? B64_ALPHABET[((b1 & 15) << 2) | (b2 >> 6)] : '=';
        out += i + 2 < len ? B64_ALPHABET[b2 & 63] : '=';
      }
      return out;
    }
    function int16ToBytes(i16) {
      const out = new Uint8Array(i16.length * 2);
      for (let i = 0; i < i16.length; i++) {
        const v = i16[i];
        out[i * 2] = v & 0xff;
        out[i * 2 + 1] = (v >> 8) & 0xff;
      }
      return out;
    }

    // ---------- 微事件器 ----------
    class Emitter {
      listeners = new Set();
      on(cb) {
        this.listeners.add(cb);
        return () => { this.listeners.delete(cb); };
      }
      emit(...args) {
        for (const cb of [...this.listeners]) cb(...args);
      }
    }

    // ---------- 插件 ----------
    const name = 'dsh-voice-input-client';
    const inject = ['sessions', 'slots', 'connection'];
    const CHANNEL = '/voice-input';

    function apply(ctx, _config = {}) {
      const logger = ctx.logger ?? console;

      // 共享狀態 store
      const events = new Emitter();
      const state = {
        status: 'idle', // idle | starting | recording | finalizing
        partial: '',
        error: '',
        hotkey: 'Alt+KeyM',
        hotkeyAlt: 'Alt+KeyV',
        engine: 'auto',
        polish: true,
        autoSend: false,
        noiseSuppression: true,
        echoCancellation: false,
        autoGainControl: true,
      };
      const setState = (patch) => {
        Object.assign(state, patch);
        events.emit();
      };
      const sourceOf = (key) => ({
        getSnapshot: () => state[key],
        subscribe: (cb) => events.on(cb),
      });

      const rpc = (endpoint, payload) => ctx.connection.rpc.call(CHANNEL, endpoint, payload);

      // 從 host 取生效配置
      void rpc('config').then((res) => {
        const v = res && res.value ? res.value : null;
        if (!v) return;
        setState({
          engine: v.engine,
          hotkey: typeof v.hotkey === 'string' && v.hotkey ? v.hotkey : state.hotkey,
          hotkeyAlt: typeof v.hotkeyAlt === 'string' && v.hotkeyAlt ? v.hotkeyAlt : state.hotkeyAlt,
          polish: v.polish !== false,
          autoSend: v.autoSend === true,
          noiseSuppression: v.noiseSuppression !== false,
          echoCancellation: v.echoCancellation === true,
          autoGainControl: v.autoGainControl !== false,
        });
      }).catch((err) => logger.warn('dsh-voice-input: /voice-input.config 不可用', String(err)));

      // ---------- 錄音 runtime ----------
      let stream = null;
      let audioCtx = null;
      let source = null;
      let analyser = null;
      let proc = null;
      let seq = 0;
      let latestAppliedSeq = -1;
      let baseDraft = '';
      let takeover = true;
      let bridge = null; // { getDraft, setDraft, submit }
      let browserRecognition = null; // Web Speech 兜底辨識器
      let browserFinalText = '';

      function cleanupAudio() {
        if (proc) { try { proc.onaudioprocess = null; proc.disconnect(); } catch (_) {} }
        if (analyser) { try { analyser.disconnect(); } catch (_) {} }
        if (source) { try { source.disconnect(); } catch (_) {} }
        if (audioCtx) { try { audioCtx.close().catch(() => {}); } catch (_) {} }
        if (stream) { stream.getTracks().forEach((t) => { try { t.stop(); } catch (_) {} }); }
        proc = null; analyser = null; source = null; audioCtx = null; stream = null;
      }

      function applyDraft(isFinal, text) {
        if (!bridge) return;
        const cur = bridge.getDraft();
        if (takeover) {
          if (!isFinal && cur !== baseDraft && !cur.startsWith(baseDraft)) {
            takeover = false; // 使用者正在編輯：不再覆寫，最終改為追加
            return;
          }
          bridge.setDraft(baseDraft + text);
        } else if (isFinal) {
          bridge.setDraft(cur + text);
        }
      }

      async function toggleMic(sessionId) {
        if (state.status === 'recording' || state.status === 'starting') {
          await stopMic();
          return;
        }
        if (state.status === 'idle') {
          await startMic();
        }
      }

      async function startMic() {
        if (state.status !== 'idle') return;
        setState({ status: 'starting', error: '', partial: '' });
        baseDraft = bridge ? String(bridge.getDraft() ?? '') : '';
        takeover = true;
        seq = 0;
        latestAppliedSeq = -1;
        // 引擎是 browser（無本地模型）→ 用 Web Speech 兜底，不碰 native
        if (state.engine === 'browser') {
          startBrowserRecognition();
          return;
        }
        try {
          const constraints = {
            audio: {
              echoCancellation: state.echoCancellation,
              noiseSuppression: state.noiseSuppression,
              autoGainControl: state.autoGainControl,
            },
          };
          stream = await navigator.mediaDevices.getUserMedia(constraints);
          audioCtx = new AudioContext({ sampleRate: 16000 });
          source = audioCtx.createMediaStreamSource(stream);
          analyser = audioCtx.createAnalyser();
          analyser.fftSize = 1024;
          source.connect(analyser);
          proc = audioCtx.createScriptProcessor(4096, 1, 1);
          const mute = audioCtx.createGain();
          mute.gain.value = 0;
          analyser.connect(proc);
          proc.connect(mute);
          mute.connect(audioCtx.destination);
          proc.onaudioprocess = (e) => {
            const f32 = e.inputBuffer.getChannelData(0);
            void computeRmsFloat(f32);
            const mySeq = seq++;
            const b64 = bytesToBase64(int16ToBytes(float32ToInt16(f32)));
            void rpc('chunk', { b64 }).then((res) => {
              if (mySeq < latestAppliedSeq) return;
              if (state.status !== 'recording' && state.status !== 'starting') return;
              latestAppliedSeq = mySeq;
              const text = res && res.ok && res.value ? res.value.text : '';
              if (typeof text === 'string') {
                setState({ partial: text });
                applyDraft(false, text);
              }
            }).catch(() => {});
          };
          setState({ status: 'recording' });
        } catch (err) {
          setState({ status: 'idle', error: '錄音啟動失敗：' + String((err && err.message) || err) });
          try { await rpc('reset'); } catch (_) {}
          cleanupAudio();
        }
      }

      async function stopMic() {
        if (state.status !== 'recording' && state.status !== 'starting') return;
        setState({ status: 'finalizing' });
        // browser 引擎：停止 Web Speech，把最終文字送 host 潤飾
        if (browserRecognition) {
          try { browserRecognition.stop(); } catch (_) {}
          browserRecognition = null;
          await new Promise((r) => setTimeout(r, 120));
          let text = browserFinalText || state.partial;
          try {
            const res = await rpc('finalize', { locale: currentLocale(), text });
            if (res && res.ok && res.value && res.value.text) text = res.value.text;
          } catch (_) {}
          applyDraft(true, text);
          if (state.autoSend && bridge) {
            try { bridge.submit(); } catch (_) {}
          }
          setState({ status: 'idle', partial: '' });
          return;
        }
        cleanupAudio();
        let text = state.partial;
        try {
          const res = await rpc('finalize', { locale: currentLocale() });
          if (res && res.ok && res.value) {
            text = res.value.text || text;
          }
        } catch (err) {
          setState({ error: '辨識結束失敗：' + String((err && err.message) || err) });
        }
        applyDraft(true, text);
        if (state.autoSend && bridge) {
          try { bridge.submit(); } catch (_) {}
        }
        setState({ status: 'idle', partial: '' });
      }

      // Web Speech 兜底辨識（無本地模型時開箱即用）
      function startBrowserRecognition() {
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) {
          setState({ status: 'idle', error: '此瀏覽器不支援語音辨識，且本地模型未安裝' });
          return;
        }
        const rec = new SR();
        browserRecognition = rec;
        browserFinalText = '';
        rec.lang = 'zh-HK';
        rec.continuous = true;
        rec.interimResults = true;
        rec.onresult = (event) => {
          let interim = '';
          let final = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const t = event.results[i][0].transcript;
            if (event.results[i].isFinal) final += t;
            else interim += t;
          }
          if (final) browserFinalText += final;
          const text = browserFinalText + interim;
          setState({ partial: text });
          applyDraft(false, text);
        };
        rec.onerror = (event) => {
          if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
            setState({ status: 'idle', error: '麥克風權限被拒：' + event.error });
            browserRecognition = null;
            return;
          }
          // 其他錯誤：繼續（no-speech 等）
        };
        rec.onend = () => {
          if (state.status === 'recording' || state.status === 'starting') {
            // 意外結束（非使用者停止）：嘗試重啟
            try { rec.start(); } catch (_) {}
          }
        };
        try {
          rec.start();
          setState({ status: 'recording' });
        } catch (err) {
          setState({ status: 'idle', error: '語音辨識啟動失敗：' + String((err && err.message) || err) });
          browserRecognition = null;
        }
      }

      function currentLocale() {
        try {
          const localeSvc = ctx.get('locale');
          if (localeSvc && typeof localeSvc.getSnapshot === 'function') {
            const s = localeSvc.getSnapshot();
            if (s && typeof s.active === 'string') return s.active;
          }
        } catch (_) {}
        return 'zh';
      }

      // ---------- 頁面內快捷鍵（序列匹配） ----------
      let keyBuffer = [];
      ctx.effect(() => {
        const onKey = (event) => {
          const target = event.target;
          if (target !== null && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
          const token = eventToToken(event);
          if (token === null) return;
          keyBuffer.push(token);
          if (keyBuffer.length > 12) keyBuffer = keyBuffer.slice(-12);
          const hk = parseHotkey(state.hotkey);
          const hkAlt = parseHotkey(state.hotkeyAlt);
          if ((hk && matchesKeySequence(keyBuffer, hk)) || (hkAlt && matchesKeySequence(keyBuffer, hkAlt))) {
            keyBuffer = [];
            event.preventDefault();
            try {
              const sessions = ctx.sessions;
              const current = sessions && sessions.list && sessions.list.getSnapshot ? sessions.list.getSnapshot().current : undefined;
              if (current !== undefined) void toggleMic(current);
            } catch (err) {
              logger.warn('dsh-voice-input: hotkey 失敗', String(err));
            }
          }
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
      }, 'dsh-voice-input: global hotkey');

      // ---------- 樣式 ----------
      const styleEl = typeof document !== 'undefined' ? document.createElement('style') : null;
      if (styleEl) {
        styleEl.textContent = `
          .dsh-voice-mic {
            display: inline-flex; align-items: center; justify-content: center;
            width: 28px; height: 28px; border-radius: 50%;
            border: 1px solid transparent; background: transparent;
            color: currentColor; opacity: 0.75; cursor: pointer;
            position: relative; padding: 0; transition: opacity .15s, background .15s;
          }
          .dsh-voice-mic:hover { opacity: 1; background: rgba(127,127,127,0.12); }
          .dsh-voice-mic.rec { color: #e5484d; opacity: 1; }
          .dsh-voice-mic.fin { opacity: 0.55; }
          .dsh-voice-mic.err { color: #e5484d; }
          .dsh-voice-mic-ring {
            position: absolute; inset: -2px; border-radius: 50%;
            border: 2px solid #e5484d; pointer-events: none;
            animation: dsh-voice-pulse 1.1s ease-out infinite;
          }
          @keyframes dsh-voice-pulse {
            0% { transform: scale(0.9); opacity: 0.9; }
            70% { transform: scale(1.5); opacity: 0; }
            100% { transform: scale(1.5); opacity: 0; }
          }
        `;
        document.head.appendChild(styleEl);
      }
      ctx.effect(() => () => {
        if (styleEl && styleEl.parentNode) styleEl.parentNode.removeChild(styleEl);
      }, 'dsh-voice-input: style cleanup');

      // ---------- 圖示 ----------
      function MicSvg() {
        return jsx('svg', {
          viewBox: '0 0 24 24', width: 15, height: 15, fill: 'currentColor', 'aria-hidden': true,
          children: [
            jsx('path', { d: 'M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3z' }),
            jsx('path', { d: 'M17 11a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z' }),
          ],
        });
      }

      // ---------- 麥克風按鈕（無 hooks：狀態經 slot inject face 的 hooks compartment） ----------
      function MicButton(props) {
        const status = props.useStatus((v) => v);
        const partial = props.usePartial((v) => v);
        const hotkey = props.useHotkey((v) => v);
        const error = props.useError((v) => v);
        // 每輪 render 更新 draft 橋（input/inputActions 由 slot owner props 提供）
        if (props.inputActions) {
          bridge = {
            getDraft: () => String(props.input && props.input.draft ? props.input.draft : ''),
            setDraft: (t) => props.inputActions.setDraft(t),
            submit: () => props.inputActions.submit(),
          };
        }
        const recording = status === 'recording' || status === 'starting';
        const cls = 'dsh-voice-mic' + (recording ? ' rec' : '') + (status === 'finalizing' ? ' fin' : '') + (error ? ' err' : '');
        let title = '语音输入（' + hotkey + '）';
        if (status === 'finalizing') title = '处理中…';
        else if (status === 'recording') title = partial !== '' ? '正在听：' + partial + '（点击停止）' : '正在听…点击停止';
        if (error) title = error;
        return jsx('button', {
          type: 'button', className: cls, title, 'aria-label': '语音输入',
          onClick: () => { void props.onToggle(); },
          children: [recording ? jsx('div', { className: 'dsh-voice-mic-ring' }) : null, MicSvg()],
        });
      }

      // ---------- Slot 註冊 ----------
      ctx.slots.inject('conversation.input.right', () => ctx.slots.register({
        name: 'conversation.input.right',
        id: 'dsh-voice-input-mic',
        order: 0,
        label: () => '语音输入',
        inject: (sessionId) => ({
          onToggle: () => { void toggleMic(sessionId).catch((err) => logger.warn('dsh-voice-input: mic 失敗', String(err))); },
          hooks: {
            status: sourceOf('status'),
            partial: sourceOf('partial'),
            hotkey: sourceOf('hotkey'),
            error: sourceOf('error'),
          },
        }),
      }, MicButton));

      return () => {
        cleanupAudio();
      };
    }

    module.exports = { name, inject, apply };
    return module.exports;
  },
});

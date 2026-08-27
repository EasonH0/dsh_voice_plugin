// dynamic-plugin/client.js — 動態 Plugin 原型：Client 半部
// 麥克風按鈕（conversation.input.right）＋語音輸入設定頁（settings.section）
// UI 文字跟隨 DSH 語言（zh/en）；錄音、降噪、音量表、監聽、快捷鍵；
// 辨識以 Host MockEngine 模擬；潤飾模型可選 DSH 已配置的 provider／key／模型。

return {
  apply(ctx) {
    const slots = ctx.get('slots');
    if (slots === undefined) return;
    const timer = ctx.get('timer');
    const localeSvc = ctx.get('locale');
    const themeSvc = ctx.get('theme');

    // ---------- 內聯：設定（與 src/core/settings.mjs 一致） ----------
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
    function normalizeSettings(raw) {
      const src = raw && typeof raw === 'object' ? raw : {};
      const out = { ...DEFAULTS, hotkeys: { ...DEFAULT_HOTKEYS } };
      for (const [key, value] of Object.entries(src)) {
        if (key === 'hotkeys') {
          const h = value && typeof value === 'object' ? value : {};
          if (typeof h.toggle === 'string' && h.toggle) out.hotkeys.toggle = h.toggle;
          if (typeof h.ptt === 'string' && h.ptt) out.hotkeys.ptt = h.ptt;
          continue;
        }
        if (key === 'engine' && (value === 'sherpa' || value === 'whisper')) out.engine = value;
        else if (key === 'recordMode' && (value === 'toggle' || value === 'ptt')) out.recordMode = value;
        else if ((key === 'inputDeviceId' || key === 'polishProvider' || key === 'polishModel') && typeof value === 'string') out[key] = value;
        else if (['noiseSuppression', 'echoCancellation', 'autoGainControl', 'monitor', 'polish', 'autoSend', 'stopOnMicOff'].includes(key) && typeof value === 'boolean') out[key] = value;
      }
      return out;
    }

    // ---------- 內聯：快捷鍵（與 src/core/hotkeys.mjs 一致） ----------
    const MOD_TOKEN_MAP = { ctrl: 'Control', alt: 'Alt', shift: 'Shift', meta: 'Meta', altleft: 'Alt', altright: 'Alt', controlleft: 'Control', controlright: 'Control', shiftleft: 'Shift', shiftright: 'Shift', metaleft: 'Meta', metaright: 'Meta' };
    const EXTRA_CODES = [
      'Backquote', 'Minus', 'Equal', 'BracketLeft', 'BracketRight', 'Backslash',
      'Semicolon', 'Quote', 'Comma', 'Period', 'Slash', 'Space', 'Enter', 'Tab',
      'Home', 'End', 'PageUp', 'PageDown', 'Insert', 'Delete',
      'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
    ];
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

    // ---------- 內聯：音訊工具（與 src/core 一致） ----------
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

    // ---------- UI 文字（跟隨 DSH 語言；正式版改接 locale 字典註冊） ----------
    const DICTS = {
      zh: {
        'mic.title.toggle': '语音输入（点击开始／停止）',
        'mic.title.ptt': '按住说话（语音输入）',
        'mic.processing': '处理中…',
        'mic.label': '语音输入',
        'err.start': '录音启动失败：{message}',
        'err.end': '识别结束失败：{message}',
        'settings.status': '原型阶段：识别以模拟引擎运作，语音不离开本机。',
        'settings.input': '输入来源',
        'settings.inputLevel': '输入音量',
        'settings.defaultMic': '系统默认麦克风',
        'settings.mic.fallback': '麦克风（{id}）',
        'settings.recordMode': '录音模式',
        'settings.recordMode.toggle': '点击开始／点击停止',
        'settings.recordMode.ptt': '按住说话（Push-to-talk）',
        'settings.engine': '识别引擎',
        'settings.engine.sherpa': 'sherpa-onnx 流式（粤・中・英）',
        'settings.engine.whisper': 'Whisper large-v3（安装阶段启用）',
        'settings.hotkeys': '快捷键',
        'settings.hotkeys.hint': '点击「录制快捷键」后依次按下想要的键（任意数量组合，例如 C+V+B+N），按 Enter 完成、Esc 取消。',
        'settings.hotkeys.toggleHint': '开始／停止',
        'settings.hotkeys.pttHint': '开始／停止（备用）',
        'settings.hotkeys.capture': '依次按键…（Enter 完成，Esc 取消）',
        'settings.hotkeys.record': '录制快捷键',
        'settings.hotkeys.recorded': '已录：{keys}（Enter 完成，Esc 取消）',
        'settings.audio': '音频处理',
        'settings.noise': '降噪',
        'settings.echo': '回声消除（无回音环境慎开）',
        'settings.agc': '自动增益（自动放大轻声收音）',
        'settings.monitor': '监听输入',
        'settings.output': '输出',
        'settings.polish': 'LLM 润色（修错字、标点、断句）',
        'settings.autoSend': '转写完成后自动发送',
        'settings.stopOnMicOff': '关麦后立即停止输出（放弃识别收尾与润色）',
        'settings.llm': '润色模型',
        'settings.llm.provider': 'API Key／Provider',
        'settings.llm.unregistered': '（未连接）',
        'settings.llm.follow': '跟随会话（{value}）',
        'settings.llm.follow.none': '跟随会话',
        'settings.llm.model': '模型',
        'settings.llm.loading': '加载中…',
      },
      en: {
        'mic.title.toggle': 'Voice input (click to start/stop)',
        'mic.title.ptt': 'Hold to talk (voice input)',
        'mic.processing': 'Processing…',
        'mic.label': 'Voice input',
        'err.start': 'Failed to start recording: {message}',
        'err.end': 'Failed to finish recognition: {message}',
        'settings.status': 'Prototype stage: recognition runs on a mock engine; audio never leaves this machine.',
        'settings.input': 'Input source',
        'settings.inputLevel': 'Input level',
        'settings.defaultMic': 'System default microphone',
        'settings.mic.fallback': 'Microphone ({id})',
        'settings.recordMode': 'Recording mode',
        'settings.recordMode.toggle': 'Click to start / click to stop',
        'settings.recordMode.ptt': 'Hold to talk (Push-to-talk)',
        'settings.engine': 'Recognition engine',
        'settings.engine.sherpa': 'sherpa-onnx streaming (Cantonese/Chinese/English)',
        'settings.engine.whisper': 'Whisper large-v3 (enabled at install stage)',
        'settings.hotkeys': 'Hotkeys',
        'settings.hotkeys.hint': 'Click "Record hotkey", then press keys in order (any number, e.g. C+V+B+N). Press Enter to finish, Esc to cancel.',
        'settings.hotkeys.toggleHint': 'Start / stop',
        'settings.hotkeys.pttHint': 'Start / stop (alternate)',
        'settings.hotkeys.capture': 'Press keys in sequence… (Enter to finish, Esc to cancel)',
        'settings.hotkeys.record': 'Record hotkey',
        'settings.hotkeys.recorded': 'Recorded: {keys} (Enter to finish, Esc to cancel)',
        'settings.audio': 'Audio processing',
        'settings.noise': 'Noise suppression',
        'settings.echo': 'Echo cancellation (avoid unless you have echo)',
        'settings.agc': 'Auto gain (amplify quiet input)',
        'settings.monitor': 'Monitor input',
        'settings.output': 'Output',
        'settings.polish': 'LLM polish (fix typos, punctuation, sentence breaks)',
        'settings.autoSend': 'Auto-send after transcription',
        'settings.stopOnMicOff': 'Stop output immediately on mic off (skip finalize and polish)',
        'settings.llm': 'Polish model',
        'settings.llm.provider': 'API key / Provider',
        'settings.llm.unregistered': ' (not connected)',
        'settings.llm.follow': 'Follow session ({value})',
        'settings.llm.follow.none': 'Follow session',
        'settings.llm.model': 'Model',
        'settings.llm.loading': 'Loading…',
      },
    };
    function currentLocale() {
      if (localeSvc && typeof localeSvc.getSnapshot === 'function') {
        try {
          const s = localeSvc.getSnapshot();
          if (s && typeof s.active === 'string') return s.active;
        } catch (_) {}
      }
      return 'zh';
    }
    function tr(lang, key, params) {
      const dict = DICTS[lang] ?? DICTS.zh;
      let s = dict[key] ?? DICTS.zh[key] ?? key;
      if (params) {
        for (const [k, v] of Object.entries(params)) s = s.split('{' + k + '}').join(String(v));
      }
      return s;
    }
    function useLocale() {
      const [lang, setLang] = React.useState(currentLocale);
      React.useEffect(() => {
        if (!localeSvc || typeof localeSvc.subscribe !== 'function') return;
        return localeSvc.subscribe(() => setLang(currentLocale()));
      }, []);
      return lang;
    }
    function useTr() {
      const lang = useLocale();
      return (key, params) => tr(lang, key, params);
    }

    function useColorScheme() {
      const read = () => {
        if (themeSvc && typeof themeSvc.getTheme === 'function') {
          try {
            const s = themeSvc.getTheme();
            if (s && s.active && s.active.colorScheme) return s.active.colorScheme;
          } catch (_) {}
        }
        return 'dark';
      };
      const [scheme, setScheme] = React.useState(read);
      React.useEffect(() => ctx.on('theme/change', () => setScheme(read())), []);
      return scheme;
    }

    // ---------- 設定 store（記憶體 + Host 同步） ----------
    let settings = { ...DEFAULTS, hotkeys: { ...DEFAULT_HOTKEYS } };
    const settingsListeners = new Set();
    const settingsStore = {
      get: () => settings,
      set(patch) {
        settings = normalizeSettings({ ...settings, ...patch });
        host.call('settings.update', settings).catch(() => {});
        for (const fn of [...settingsListeners]) fn(settings);
      },
      subscribe(fn) {
        settingsListeners.add(fn);
        fn(settings);
        return () => { settingsListeners.delete(fn); };
      },
    };
    host.call('settings.get').then((v) => {
      if (v && typeof v === 'object') {
        settings = normalizeSettings(v);
        for (const fn of [...settingsListeners]) fn(settings);
      }
    }).catch(() => {});

    let capturingHotkey = null;
    let meterHandle = null;
    let keyBuffer = []; // 快捷鍵序列滑動窗（最近 12 個 token）

    function useSettings() {
      const [s, setS] = React.useState(settingsStore.get());
      React.useEffect(() => settingsStore.subscribe(setS), []);
      return s;
    }

    // ---------- 語音控制器 ----------
    const voiceListeners = new Set();
    let vStatus = 'idle';
    let vLevel = 0;
    let vLiveText = '';
    let vError = '';
    let vErrorKind = 'start';
    let vBaseDraft = '';
    let vTakeover = true;
    let vSeq = 0;
    let vLatestAppliedSeq = -1;
    let vMonitorOn = false;
    let vBridge = null;
    let vPendingStop = false;
    let vStream = null;
    let vAudioCtx = null;
    let vSource = null;
    let vAnalyser = null;
    let vProc = null;

    function voiceSnapshot() {
      return { status: vStatus, level: vLevel, liveText: vLiveText, error: vError, errorKind: vErrorKind };
    }
    function voiceEmit() {
      const s = voiceSnapshot();
      for (const fn of [...voiceListeners]) fn(s);
    }
    const voice = {
      subscribe(fn) {
        voiceListeners.add(fn);
        fn(voiceSnapshot());
        return () => { voiceListeners.delete(fn); };
      },
      setBridge(bridge) { vBridge = bridge; },
      setMonitor(on) {
        vMonitorOn = !!on;
        if (vSource && vAudioCtx) {
          try {
            if (vMonitorOn) vSource.connect(vAudioCtx.destination);
            else vSource.disconnect(vAudioCtx.destination);
          } catch (_) {}
        }
      },
      snapshot: voiceSnapshot,
      toggle() {
        if (vStatus === 'recording' || vStatus === 'starting') {
          voiceStop();
        } else if (vStatus === 'idle') {
          voiceStart();
        }
      },
    };

    function voiceCleanupAudio() {
      if (vProc) { try { vProc.onaudioprocess = null; vProc.disconnect(); } catch (_) {} }
      if (vAnalyser) { try { vAnalyser.disconnect(); } catch (_) {} }
      if (vSource) { try { vSource.disconnect(); } catch (_) {} }
      if (vAudioCtx) { try { vAudioCtx.close().catch(() => {}); } catch (_) {} }
      if (vStream) { vStream.getTracks().forEach((t) => { try { t.stop(); } catch (_) {} }); }
      vProc = null; vAnalyser = null; vSource = null; vAudioCtx = null; vStream = null;
    }

    function voiceApplyDraft(isFinal, text) {
      if (!vBridge) return;
      const cur = vBridge.getDraft();
      if (vTakeover) {
        if (!isFinal && cur !== vBaseDraft && !cur.startsWith(vBaseDraft)) {
          vTakeover = false;
          return;
        }
        vBridge.setDraft(vBaseDraft + text);
      } else if (isFinal) {
        vBridge.setDraft(cur + text);
      }
    }

    async function voiceStart() {
      if (vStatus !== 'idle') return false;
      vStatus = 'starting';
      vError = '';
      vLiveText = '';
      vPendingStop = false;
      vSeq = 0;
      vLatestAppliedSeq = -1;
      vTakeover = true;
      vBaseDraft = vBridge ? String(vBridge.getDraft() ?? '') : '';
      voiceEmit();
      try {
        const beginRes = await host.call('voice.begin', { sampleRate: 16000 });
        if (!beginRes || beginRes.ok !== true) {
          throw new Error(beginRes && beginRes.error ? beginRes.error : 'begin failed');
        }
        const s = settingsStore.get();
        const constraints = {
          audio: {
            deviceId: s.inputDeviceId ? { exact: s.inputDeviceId } : undefined,
            echoCancellation: s.echoCancellation,
            noiseSuppression: s.noiseSuppression,
            autoGainControl: s.autoGainControl,
          },
        };
        vStream = await navigator.mediaDevices.getUserMedia(constraints);
        vAudioCtx = new AudioContext({ sampleRate: 16000 });
        vSource = vAudioCtx.createMediaStreamSource(vStream);
        vAnalyser = vAudioCtx.createAnalyser();
        vAnalyser.fftSize = 1024;
        vSource.connect(vAnalyser);
        if (vMonitorOn) vSource.connect(vAudioCtx.destination);
        vProc = vAudioCtx.createScriptProcessor(4096, 1, 1);
        const mute = vAudioCtx.createGain();
        mute.gain.value = 0;
        vAnalyser.connect(vProc);
        vProc.connect(mute);
        mute.connect(vAudioCtx.destination);
        vProc.onaudioprocess = (e) => {
          const f32 = e.inputBuffer.getChannelData(0);
          vLevel = computeRmsFloat(f32);
          const mySeq = vSeq++;
          const b64 = bytesToBase64(int16ToBytes(float32ToInt16(f32)));
          host.call('voice.chunk', { seq: mySeq, b64 }).then((res) => {
            if (mySeq < vLatestAppliedSeq) return;
            if (vStatus !== 'recording' && vStatus !== 'starting') return; // 已停止：不再寫入草稿
            vLatestAppliedSeq = mySeq;
            vLiveText = res && typeof res.text === 'string' ? res.text : vLiveText;
            voiceApplyDraft(false, vLiveText);
          }).catch(() => {});
        };
        if (vPendingStop) {
          await voiceFinalize();
          return false;
        }
        vStatus = 'recording';
        voiceEmit();
        return true;
      } catch (err) {
        vError = String((err && err.message) || err);
        vErrorKind = 'start';
        try { await host.call('voice.reset', {}); } catch (_) {}
        voiceCleanupAudio();
        vStatus = 'idle';
        voiceEmit();
        return false;
      }
    }

    async function voiceStop() {
      if (vStatus === 'starting') {
        vPendingStop = true;
        return false;
      }
      if (vStatus !== 'recording') return false;
      await voiceFinalize();
      return true;
    }

    async function voiceFinalize() {
      if (settingsStore.get().stopOnMicOff) {
        voiceCleanupAudio(); // 關鍵：先停掉麥克風與音訊處理，避免 onaudioprocess 繼續寫空文字覆蓋草稿
        try { await host.call('voice.reset', {}); } catch (_) {}
        vLiveText = '';
        vStatus = 'idle';
        voiceEmit();
        return;
      }
      vStatus = 'finalizing';
      voiceEmit();
      voiceCleanupAudio();
      let text = vLiveText;
      try {
        const res = await host.call('voice.end', { locale: currentLocale() });
        text = res && typeof res.text === 'string' ? res.text : text;
      } catch (err) {
        vError = String((err && err.message) || err);
        vErrorKind = 'end';
      }
      voiceApplyDraft(true, text);
      if (settingsStore.get().autoSend && vBridge) {
        try { vBridge.submit(); } catch (_) {}
      }
      vLiveText = text;
      vStatus = 'idle';
      voiceEmit();
    }

    // ---------- 頁面內快捷鍵（全域監聽，元件生命週期外） ----------
    ctx.effect(() => {
      if (typeof window === 'undefined' || !window.addEventListener) return;
      const onKeyDown = (e) => {
        if (capturingHotkey) return;
        const token = eventToToken(e);
        if (token === null) return;
        keyBuffer.push(token);
        if (keyBuffer.length > 12) keyBuffer = keyBuffer.slice(-12);
        const s = settingsStore.get();
        const hkToggle = parseHotkey(s.hotkeys.toggle);
        const hkPtt = parseHotkey(s.hotkeys.ptt);
        if (hkToggle && matchesKeySequence(keyBuffer, hkToggle)) {
          keyBuffer = [];
          e.preventDefault();
          voice.toggle();
          return;
        }
        if (hkPtt && matchesKeySequence(keyBuffer, hkPtt)) {
          keyBuffer = [];
          e.preventDefault();
          voice.toggle();
        }
      };
      window.addEventListener('keydown', onKeyDown);
      return () => {
        window.removeEventListener('keydown', onKeyDown);
      };
    });

    // ---------- 樣式 ----------
    styles.insert(`
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
      .dsh-voice-page { display: flex; flex-direction: column; gap: 2px; padding: 4px 0; }
      .dsh-voice-row {
        display: flex; align-items: center; gap: 12px; padding: 10px 0;
        border-bottom: 1px solid var(--dsw-alias-border-l1, transparent);
      }
      .dsh-voice-row-last { border-bottom: none; }
      .dsh-voice-row-label {
        flex: 0 0 110px; opacity: 1; font-size: 13px;
        color: var(--dsw-alias-label-secondary, inherit);
      }
      .dsh-voice-row select, .dsh-voice-row input[type=text] {
        flex: 1; min-width: 0; background: var(--dsw-alias-bg-layer-1, transparent);
        color: var(--dsw-alias-label-primary, inherit);
        border: 1px solid var(--dsw-alias-border-l1, rgba(127,127,127,0.35));
        border-radius: 6px; padding: 5px 8px; font: inherit;
      }
      .dsh-voice-switch-row {
        display: flex; align-items: center; justify-content: space-between; gap: 12px;
        padding: 5px 0; cursor: pointer; font-size: 13px;
      }
      .dsh-voice-switch-label { color: var(--dsw-alias-label-primary, inherit); }
      .dsh-switch { position: relative; width: 34px; height: 20px; flex: 0 0 auto; }
      .dsh-switch input { position: absolute; opacity: 0; pointer-events: none; margin: 0; }
      .dsh-switch-track {
        position: absolute; inset: 0; border-radius: 999px;
        background: var(--dsw-alias-border-l1, rgba(127,127,127,0.4));
        transition: background .15s ease;
      }
      .dsh-switch-thumb {
        position: absolute; top: 2px; left: 2px; width: 16px; height: 16px;
        border-radius: 50%; background: var(--dsw-alias-label-primary, #fff);
        transition: transform .15s ease;
      }
      .dsh-switch input:checked ~ .dsh-switch-track { background: var(--dsw-alias-brand-primary, #4c9aff); }
      .dsh-switch input:checked ~ .dsh-switch-thumb { transform: translateX(14px); }
      .dsh-voice-hint { font-size: 12px; opacity: 0.6; }
      .dsh-voice-meter {
        flex: 1; height: 8px; border-radius: 4px; overflow: hidden;
        background: rgba(127,127,127,0.18);
      }
      .dsh-voice-meter-fill {
        height: 100%; width: 0%; border-radius: 4px;
        background: linear-gradient(90deg, #4c9aff, #36d399);
        transition: width .08s linear;
      }
      .dsh-voice-kbd {
        display: inline-block; padding: 2px 8px; border-radius: 5px;
        border: 1px solid rgba(127,127,127,0.4); font-size: 12px; margin-right: 6px;
      }
      .dsh-voice-btn {
        background: transparent; color: inherit; cursor: pointer;
        border: 1px solid rgba(127,127,127,0.4); border-radius: 6px;
        padding: 4px 10px; font: inherit; font-size: 12px;
      }
      .dsh-voice-btn:hover { background: rgba(127,127,127,0.12); }
      .dsh-voice-btn.capture { border-color: #4c9aff; color: #4c9aff; }
      .dsh-voice-status { font-size: 12px; opacity: 0.7; }
      .dsh-voice-status.err { color: #e5484d; }
      .dsh-voice-keys { display: flex; flex-direction: column; gap: 4px; font-size: 12px; opacity: 0.75; }
      .dsh-voice-keys-item { font-family: inherit; }
      .dsh-vsel { position: relative; flex: 1; min-width: 0; }
      .dsh-vsel-trigger {
        display: flex; align-items: center; justify-content: space-between; gap: 8px;
        width: 100%; min-width: 0;
        background: var(--dsw-alias-bg-layer-1, transparent);
        color: var(--dsw-alias-label-primary, inherit);
        border: 1px solid var(--dsw-alias-border-l1, rgba(127,127,127,0.35));
        border-radius: 6px; padding: 5px 8px;
        font: inherit; cursor: pointer;
      }
      .dsh-vsel-trigger:hover { border-color: var(--dsw-alias-border-l2, rgba(127,127,127,0.6)); }
      .dsh-vsel-value { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; opacity: 0.95; }
      .dsh-vsel-popup {
        position: absolute; top: calc(100% + 4px); left: 0; right: 0; z-index: 80;
        background: var(--dsw-alias-bg-overlay, rgba(24,24,28,0.98));
        color: var(--dsw-alias-label-primary, #e8e8ec);
        border: 1px solid var(--dsw-alias-border-l1, rgba(127,127,127,0.4));
        border-radius: 6px; overflow: hidden;
        box-shadow: 0 8px 24px rgba(0,0,0,0.45); max-height: 240px; overflow-y: auto;
      }
      .dsh-vsel-opt {
        display: block; width: 100%; text-align: left; padding: 6px 10px;
        font: inherit; background: transparent; color: inherit; border: 0; cursor: pointer;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .dsh-vsel-opt:hover { background: color-mix(in srgb, var(--dsw-alias-label-secondary, rgba(127,127,127,0.4)) 20%, transparent); }
      .dsh-vsel-opt.sel { background: color-mix(in srgb, var(--dsw-alias-brand-primary, #4c9aff) 25%, transparent); }
      .dsh-vsel-backdrop { position: fixed; inset: 0; z-index: 70; background: transparent; }
    `);

    // ---------- 圖示 ----------
    function MicSvg() {
      return React.createElement(
        'svg',
        { viewBox: '0 0 24 24', width: 15, height: 15, fill: 'currentColor', 'aria-hidden': true },
        React.createElement('path', { d: 'M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3z' }),
        React.createElement('path', { d: 'M17 11a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z' }),
      );
    }

    // ---------- 麥克風按鈕 ----------
    function MicButton(props) {
      const { input, inputActions } = props;
      const [v, setV] = React.useState(voice.snapshot());
      const s = useSettings();
      const tt = useTr();
      React.useEffect(() => voice.subscribe(setV), []);
      React.useEffect(() => {
        voice.setBridge({
          getDraft: () => String(input && input.draft ? input.draft : ''),
          setDraft: (t) => inputActions.setDraft(t),
          submit: () => inputActions.submit(),
        });
        return () => voice.setBridge(null);
      }, [input, inputActions]);

      const recording = v.status === 'recording' || v.status === 'starting';
      const cls = ['dsh-voice-mic'];
      if (recording) cls.push('rec');
      if (v.status === 'finalizing') cls.push('fin');
      if (v.error) cls.push('err');
      const mode = s.recordMode;
      const handlers = mode === 'ptt'
        ? {
            onMouseDown: (e) => { e.preventDefault(); voiceStart(); },
            onMouseUp: () => { voiceStop(); },
            onMouseLeave: () => { voiceStop(); },
            onTouchStart: (e) => { e.preventDefault(); voiceStart(); },
            onTouchEnd: () => { voiceStop(); },
          }
        : { onClick: () => voice.toggle() };

      let title = mode === 'ptt' ? tt('mic.title.ptt') : tt('mic.title.toggle');
      if (v.status === 'finalizing') title = tt('mic.processing');
      if (v.error) title = tt('err.' + v.errorKind, { message: v.error });

      return React.createElement(
        'button',
        { type: 'button', className: cls.join(' '), title, 'aria-label': tt('mic.label'), ...handlers },
        recording ? React.createElement('div', { className: 'dsh-voice-mic-ring' }) : null,
        MicSvg(),
      );
    }

    // ---------- 設定頁 ----------
    function Row(props) {
      return React.createElement(
        'div',
        { className: 'dsh-voice-row' },
        React.createElement('span', { className: 'dsh-voice-row-label' }, props.label),
        props.children,
      );
    }
    function Check(props) {
      return React.createElement('label', { className: 'dsh-voice-switch-row' },
        React.createElement('span', { className: 'dsh-voice-switch-label' }, props.label),
        React.createElement('span', { className: 'dsh-switch' },
          React.createElement('input', {
            type: 'checkbox',
            checked: !!props.checked,
            onChange: (e) => settingsStore.set({ [props.name]: e.target.checked }),
          }),
          React.createElement('span', { className: 'dsh-switch-track' }),
          React.createElement('span', { className: 'dsh-switch-thumb' }),
        ),
      );
    }

    function SettingsPage(_props) {
      function ChevronSvg() {
        return React.createElement('svg', { viewBox: '0 0 24 24', width: 12, height: 12, fill: 'none', stroke: 'currentColor', strokeWidth: 2 },
          React.createElement('path', { d: 'M6 9l6 6 6-6' }));
      }
      // 自訂下拉選單：繞過瀏覽器原生渲染，深色主題下背景正確
      function VoiceSelect(props) {
        const [open, setOpen] = React.useState(false);
        const options = props.options || [];
        const cur = options.find((o) => o.value === props.value);
        return React.createElement('div', { className: 'dsh-vsel' },
          React.createElement('button', {
            type: 'button',
            className: 'dsh-vsel-trigger',
            onClick: () => setOpen(!open),
          },
            React.createElement('span', { className: 'dsh-vsel-value' }, cur ? cur.label : ''),
            ChevronSvg(),
          ),
          open ? React.createElement('div', { className: 'dsh-vsel-popup' },
            options.map((o) => React.createElement('button', {
              key: o.value,
              type: 'button',
              className: 'dsh-vsel-opt' + (o.value === props.value ? ' sel' : ''),
              onClick: () => { props.onChange(o.value); setOpen(false); },
            }, o.label)),
          ) : null,
          open ? React.createElement('div', { className: 'dsh-vsel-backdrop', onClick: () => setOpen(false) }) : null,
        );
      }
      const s = useSettings();
      const tt = useTr();
      const scheme = useColorScheme();
      const [devices, setDevices] = React.useState([]);
      const [level, setLevel] = React.useState(0);
      const [capture, setCapture] = React.useState(null);
      const [recorded, setRecorded] = React.useState([]);
      const [catalog, setCatalog] = React.useState(null);
      const [modelList, setModelList] = React.useState([]);

      // 列舉麥克風裝置
      React.useEffect(() => {
        let alive = true;
        (async () => {
          try {
            if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
            const list = await navigator.mediaDevices.enumerateDevices();
            if (!alive) return;
            setDevices(list
              .filter((d) => d.kind === 'audioinput')
              .map((d) => ({ id: d.deviceId, label: d.label || tt('settings.mic.fallback', { id: String(d.deviceId).slice(0, 6) }) })));
          } catch (_) {}
        })();
        return () => { alive = false; };
      }, []);

      // DSH 模型目錄（provider = 已配置 API key 的路由）與已存憑證
      React.useEffect(() => {
        host.call('llm.catalog').then((c) => setCatalog(c && typeof c === 'object' ? c : null)).catch(() => setCatalog(null));
      }, []);
      const activeProvider = s.polishProvider || (catalog && catalog.defaultProvider) || '';
      React.useEffect(() => {
        if (!activeProvider) { setModelList([]); return; }
        host.call('llm.models', { provider: activeProvider })
          .then((m) => setModelList(Array.isArray(m) ? m : []))
          .catch(() => setModelList([]));
      }, [activeProvider]);

      // 音量表：對選中裝置建立 meter stream（含降噪設定），即時讀取音量
      React.useEffect(() => {
        let disposed = false;
        let intervalDisposer = null;
        if (timer && typeof timer.interval === 'function') {
          intervalDisposer = timer.interval(() => {
            const m = meterHandle;
            if (!m || !m.analyser) return;
            const data = new Uint8Array(m.analyser.frequencyBinCount);
            m.analyser.getByteTimeDomainData(data);
            let sum = 0;
            for (let i = 0; i < data.length; i++) {
              const v = (data[i] - 128) / 128;
              sum += v * v;
            }
            setLevel(Math.sqrt(sum / data.length));
          }, 100);
        }
        (async () => {
          try {
            if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
            const constraints = {
              audio: {
                deviceId: s.inputDeviceId ? { exact: s.inputDeviceId } : undefined,
                echoCancellation: s.echoCancellation,
                noiseSuppression: s.noiseSuppression,
                autoGainControl: s.autoGainControl,
              },
            };
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            if (disposed) {
              stream.getTracks().forEach((t) => { try { t.stop(); } catch (_) {} });
              return;
            }
            const actx = new AudioContext();
            const src = actx.createMediaStreamSource(stream);
            const an = actx.createAnalyser();
            an.fftSize = 1024;
            src.connect(an);
            meterHandle = { ctx: actx, stream, source: src, analyser: an };
            if (s.monitor) {
              try { src.connect(actx.destination); } catch (_) {}
            }
          } catch (_) { /* 權限或裝置問題：音量表保持 0 */ }
        })();
        return () => {
          disposed = true;
          if (intervalDisposer) intervalDisposer();
          const m = meterHandle;
          if (m) {
            try { m.analyser.disconnect(); m.source.disconnect(); } catch (_) {}
            m.stream.getTracks().forEach((t) => { try { t.stop(); } catch (_) {} });
            try { m.ctx.close().catch(() => {}); } catch (_) {}
          }
          meterHandle = null;
        };
      }, [s.inputDeviceId, s.echoCancellation, s.noiseSuppression, s.autoGainControl]);

      // 監聽開關：即時控制 meter stream 的播放
      React.useEffect(() => {
        const m = meterHandle;
        if (!m) return;
        try {
          if (s.monitor) m.source.connect(m.ctx.destination);
          else m.source.disconnect(m.ctx.destination);
        } catch (_) {}
      }, [s.monitor]);

      // 快捷鍵錄製（修飾鍵按下不結束，等待主鍵組合；Esc 取消）
      // 快捷鍵錄製：依次收集任意數量按鍵（Enter 完成、Esc 取消）
      React.useEffect(() => {
        capturingHotkey = capture;
        if (!capture || typeof window === 'undefined') return;
        let collected = [];
        const onKey = (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (e.code === 'Escape') {
            capturingHotkey = null;
            setCapture(null);
            setRecorded([]);
            return;
          }
          if (e.code === 'Enter' || e.code === 'NumpadEnter') {
            if (collected.length > 0) {
              settingsStore.set({ hotkeys: { ...settingsStore.get().hotkeys, [capture]: collected.join('+') } });
            }
            capturingHotkey = null;
            setCapture(null);
            setRecorded([]);
            return;
          }
          const token = eventToToken(e);
          if (token === null) return;
          if (collected.length >= 12) return;
          collected.push(token);
          setRecorded(collected.map((t) => t));
        };
        window.addEventListener('keydown', onKey, true);
        return () => {
          window.removeEventListener('keydown', onKey, true);
          capturingHotkey = null;
        };
      }, [capture]);

      const fillPct = Math.min(100, Math.round(level * 140));
      const providers = catalog ? catalog.providers : null;
      const defaultLabel = catalog && catalog.defaultProvider
        ? tt('settings.llm.follow', { value: catalog.defaultProvider + (catalog.defaultModel ? ' / ' + catalog.defaultModel : '') })
        : tt('settings.llm.follow.none');

      return React.createElement(
        'div',
        { className: 'dsh-voice-page', style: { colorScheme: scheme } },
        React.createElement('div', { className: 'dsh-voice-status' }, tt('settings.status')),
        Row({
          label: tt('settings.input'),
          children: [
            VoiceSelect({
              value: s.inputDeviceId,
              onChange: (v) => settingsStore.set({ inputDeviceId: v }),
              options: [
                { value: '', label: tt('settings.defaultMic') },
                ...devices.map((d) => ({ value: d.id, label: d.label })),
              ],
            }),
          ],
        }),
        Row({
          label: tt('settings.inputLevel'),
          children: [
            React.createElement('div', { className: 'dsh-voice-meter' },
              React.createElement('div', { className: 'dsh-voice-meter-fill', style: { width: fillPct + '%' } })),
          ],
        }),
        Row({
          label: tt('settings.recordMode'),
          children: [
            VoiceSelect({
              value: s.recordMode,
              onChange: (v) => settingsStore.set({ recordMode: v }),
              options: [
                { value: 'toggle', label: tt('settings.recordMode.toggle') },
                { value: 'ptt', label: tt('settings.recordMode.ptt') },
              ],
            }),
          ],
        }),
        Row({
          label: tt('settings.engine'),
          children: [
            VoiceSelect({
              value: s.engine,
              onChange: (v) => settingsStore.set({ engine: v }),
              options: [
                { value: 'sherpa', label: tt('settings.engine.sherpa') },
                { value: 'whisper', label: tt('settings.engine.whisper') },
              ],
            }),
          ],
        }),
        React.createElement('div', { className: 'dsh-voice-row' },
          React.createElement('span', { className: 'dsh-voice-row-label' }, tt('settings.hotkeys')),
          React.createElement('div', { style: { flex: 1, display: 'flex', flexDirection: 'column', gap: 6 } },
            React.createElement('div', { className: 'dsh-voice-hint' }, tt('settings.hotkeys.hint')),
            React.createElement('div', { className: 'dsh-voice-row' },
              React.createElement('span', { className: 'dsh-voice-kbd' }, s.hotkeys.toggle),
              React.createElement('span', { className: 'dsh-voice-hint' }, tt('settings.hotkeys.toggleHint')),
              React.createElement('button', {
                type: 'button',
                className: 'dsh-voice-btn' + (capture === 'toggle' ? ' capture' : ''),
                onClick: () => setCapture(capture === 'toggle' ? null : 'toggle'),
              }, capture === 'toggle'
                ? (recorded.length > 0 ? tt('settings.hotkeys.recorded', { keys: recorded.join(' + ') }) : tt('settings.hotkeys.capture'))
                : tt('settings.hotkeys.record')),
            ),
            React.createElement('div', { className: 'dsh-voice-row' },
              React.createElement('span', { className: 'dsh-voice-kbd' }, s.hotkeys.ptt),
              React.createElement('span', { className: 'dsh-voice-hint' }, tt('settings.hotkeys.pttHint')),
              React.createElement('button', {
                type: 'button',
                className: 'dsh-voice-btn' + (capture === 'ptt' ? ' capture' : ''),
                onClick: () => setCapture(capture === 'ptt' ? null : 'ptt'),
              }, capture === 'ptt'
                ? (recorded.length > 0 ? tt('settings.hotkeys.recorded', { keys: recorded.join(' + ') }) : tt('settings.hotkeys.capture'))
                : tt('settings.hotkeys.record')),
            ),
          ),
        ),
        React.createElement('div', { className: 'dsh-voice-row' },
          React.createElement('span', { className: 'dsh-voice-row-label' }, tt('settings.audio')),
          React.createElement('div', { style: { flex: 1, display: 'flex', flexDirection: 'column', gap: 8 } },
            Check({ name: 'noiseSuppression', checked: s.noiseSuppression, label: tt('settings.noise') }),
            Check({ name: 'echoCancellation', checked: s.echoCancellation, label: tt('settings.echo') }),
            Check({ name: 'autoGainControl', checked: s.autoGainControl, label: tt('settings.agc') }),
            Check({ name: 'monitor', checked: s.monitor, label: tt('settings.monitor') }),
          ),
        ),
        React.createElement('div', { className: 'dsh-voice-row' },
          React.createElement('span', { className: 'dsh-voice-row-label' }, tt('settings.output')),
          React.createElement('div', { style: { flex: 1, display: 'flex', flexDirection: 'column', gap: 8 } },
            Check({ name: 'polish', checked: s.polish, label: tt('settings.polish') }),
            Check({ name: 'autoSend', checked: s.autoSend, label: tt('settings.autoSend') }),
            Check({ name: 'stopOnMicOff', checked: s.stopOnMicOff, label: tt('settings.stopOnMicOff') }),
          ),
        ),
        React.createElement('div', { className: 'dsh-voice-row' },
          React.createElement('span', { className: 'dsh-voice-row-label' }, tt('settings.llm')),
          React.createElement('div', { style: { flex: 1, display: 'flex', flexDirection: 'column', gap: 8 } },
            React.createElement('div', { className: 'dsh-voice-row' },
              React.createElement('span', { className: 'dsh-voice-hint', style: { flex: '0 0 96px' } }, tt('settings.llm.provider')),
              VoiceSelect({
                value: s.polishProvider,
                onChange: (v) => {
                  if (v === '') {
                    settingsStore.set({ polishProvider: '', polishModel: '' });
                    return;
                  }
                  host.call('llm.models', { provider: v })
                    .then((list) => {
                      const first = Array.isArray(list) && list.length > 0 ? list[0].id : '';
                      settingsStore.set({ polishProvider: v, polishModel: first });
                    })
                    .catch(() => settingsStore.set({ polishProvider: v, polishModel: '' }));
                },
                options: [
                  { value: '', label: defaultLabel },
                  ...(providers === null ? [] : providers.map((p) => ({ value: p.id, label: p.name + (p.registered ? '' : tt('settings.llm.unregistered')) }))),
                ],
              }),
            ),
            React.createElement('div', { className: 'dsh-voice-row' },
              React.createElement('span', { className: 'dsh-voice-hint', style: { flex: '0 0 96px' } }, tt('settings.llm.model')),
              VoiceSelect({
                value: s.polishModel,
                onChange: (v) => {
                  if (v === '') {
                    settingsStore.set({ polishProvider: '', polishModel: '' });
                    return;
                  }
                  // 選擇具體模型：provider 自動跳到對應的 provider
                  settingsStore.set({ polishModel: v, polishProvider: activeProvider });
                },
                options: [
                  { value: '', label: defaultLabel },
                  ...modelList.map((m) => ({ value: m.id, label: m.name })),
                  // 保險：目前值不在清單（例如尚未載入）時仍可顯示
                  ...(s.polishModel && !modelList.some((m) => m.id === s.polishModel) ? [{ value: s.polishModel, label: s.polishModel }] : []),
                ],
              }),
            ),
          ),
        ),
      );
    }

    // ---------- Slot 註冊（label 用 thunk：語言切換時文字即時跟隨） ----------
    slots.inject('conversation.input.right', () => slots.register(
      {
        name: 'conversation.input.right',
        id: 'dsh-voice-input-mic',
        order: 0,
        label: () => (currentLocale() === 'en' ? 'Voice Input' : '语音输入'),
      },
      (props) => React.createElement(MicButton, props),
    ));

    slots.inject('settings.section', () => slots.register(
      {
        name: 'settings.section',
        id: 'dsh-voice-input',
        order: 30,
        label: () => (currentLocale() === 'en' ? 'Voice Input' : '语音输入'),
      },
      (props) => React.createElement(SettingsPage, props),
    ));
  },
};

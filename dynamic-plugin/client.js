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

    // ---------- 內聯：設定（與 src/core/settings.mjs 一致） ----------
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
      polishProvider: '',
      polishModel: '',
      autoSend: false,
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
        else if (['noiseSuppression', 'echoCancellation', 'autoGainControl', 'monitor', 'polish', 'autoSend'].includes(key) && typeof value === 'boolean') out[key] = value;
      }
      return out;
    }

    // ---------- 內聯：快捷鍵（與 src/core/hotkeys.mjs 一致） ----------
    function parseHotkey(spec) {
      if (typeof spec !== 'string' || spec.trim().length === 0) return null;
      const parts = spec.split('+').map((p) => p.trim());
      const mods = { ctrl: false, alt: false, shift: false, meta: false };
      let code = null;
      for (const part of parts) {
        const lower = part.toLowerCase();
        if (['ctrl', 'alt', 'shift', 'meta'].includes(lower)) {
          mods[lower] = true;
        } else {
          const m = part.match(/^(key)([a-z])$/i) ?? part.match(/^(digit)([0-9])$/i) ?? part.match(/^(f)([1-9]|1[0-2])$/i);
          if (!m) return null;
          if (code !== null) return null;
          const kind = m[1][0].toUpperCase() + m[1].slice(1).toLowerCase();
          code = kind === 'F' ? kind + m[2] : kind + m[2].toUpperCase();
        }
      }
      if (code === null) return null;
      return { ...mods, code };
    }
    function matchesHotkey(event, hotkey) {
      const h = typeof hotkey === 'string' ? parseHotkey(hotkey) : hotkey;
      if (!h || !event || typeof event.code !== 'string') return false;
      return event.code === h.code && !!event.ctrlKey === h.ctrl && !!event.altKey === h.alt && !!event.shiftKey === h.shift && !!event.metaKey === h.meta;
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
        'mic.title.toggle': '語音輸入（點擊開始／停止）',
        'mic.title.ptt': '按住說話（語音輸入）',
        'mic.processing': '處理中…',
        'mic.label': '語音輸入',
        'err.start': '錄音啟動失敗：{message}',
        'err.end': '辨識結束失敗：{message}',
        'settings.status': '原型階段：辨識以模擬引擎運作，語音不離開本機。',
        'settings.input': '輸入來源',
        'settings.inputLevel': '輸入音量',
        'settings.defaultMic': '系統預設麥克風',
        'settings.mic.fallback': '麥克風（{id}）',
        'settings.recordMode': '錄音模式',
        'settings.recordMode.toggle': '點擊開始／點擊停止',
        'settings.recordMode.ptt': '按住說話（Push-to-talk）',
        'settings.engine': '辨識引擎',
        'settings.engine.sherpa': 'sherpa-onnx 串流（粵・中・英）',
        'settings.engine.whisper': 'Whisper large-v3（安裝階段啟用）',
        'settings.hotkeys': '快捷鍵',
        'settings.hotkeys.toggleHint': '開始／停止',
        'settings.hotkeys.pttHint': '按住說話',
        'settings.hotkeys.capture': '按下新快捷鍵…',
        'settings.hotkeys.record': '錄製',
        'settings.audio': '音訊處理',
        'settings.noise': '降噪（抑制環境噪音）',
        'settings.echo': '回音消除',
        'settings.agc': '自動增益',
        'settings.monitor': '監聽輸入（開降噪時聽到降噪後效果）',
        'settings.output': '輸出',
        'settings.polish': 'LLM 潤飾（修錯字、標點、斷句）',
        'settings.autoSend': '轉錄完成後自動發送',
        'settings.llm': '潤飾模型（DSH 模型）',
        'settings.llm.provider': 'API Key／Provider',
        'settings.llm.follow': '跟隨 DSH 預設（{value}）',
        'settings.llm.follow.none': '跟隨 DSH 預設',
        'settings.llm.model': '模型',
        'settings.llm.keys': 'DSH 已配置的憑證',
        'settings.llm.nokeys': '（未偵測到已配置的憑證）',
        'settings.llm.loading': '載入中…',
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
        'settings.hotkeys.toggleHint': 'Start / stop',
        'settings.hotkeys.pttHint': 'Hold to talk',
        'settings.hotkeys.capture': 'Press new hotkey…',
        'settings.hotkeys.record': 'Record',
        'settings.audio': 'Audio processing',
        'settings.noise': 'Noise suppression',
        'settings.echo': 'Echo cancellation',
        'settings.agc': 'Auto gain control',
        'settings.monitor': 'Monitor input (hears denoised audio when suppression is on)',
        'settings.output': 'Output',
        'settings.polish': 'LLM polish (fix typos, punctuation, sentence breaks)',
        'settings.autoSend': 'Auto-send after transcription',
        'settings.llm': 'Polish model (DSH models)',
        'settings.llm.provider': 'API key / Provider',
        'settings.llm.follow': 'Follow DSH default ({value})',
        'settings.llm.follow.none': 'Follow DSH default',
        'settings.llm.model': 'Model',
        'settings.llm.keys': 'Credentials configured in DSH',
        'settings.llm.nokeys': '(no configured credentials detected)',
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
        const s = settingsStore.get();
        const hkToggle = parseHotkey(s.hotkeys.toggle);
        const hkPtt = parseHotkey(s.hotkeys.ptt);
        if (hkToggle && matchesHotkey(e, hkToggle) && !e.repeat) {
          e.preventDefault();
          voice.toggle();
          return;
        }
        if (hkPtt && matchesHotkey(e, hkPtt) && !e.repeat) {
          e.preventDefault();
          voiceStart();
        }
      };
      const onKeyUp = (e) => {
        if (capturingHotkey) return;
        const hkPtt = parseHotkey(settingsStore.get().hotkeys.ptt);
        if (hkPtt && matchesHotkey(e, hkPtt)) {
          e.preventDefault();
          voiceStop();
        }
      };
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);
      return () => {
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
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
      .dsh-voice-page { display: flex; flex-direction: column; gap: 14px; padding: 4px 0; }
      .dsh-voice-row { display: flex; align-items: center; gap: 12px; }
      .dsh-voice-row-label { flex: 0 0 120px; opacity: 0.8; font-size: 13px; }
      .dsh-voice-row select, .dsh-voice-row input[type=text] {
        flex: 1; min-width: 0; background: transparent; color: inherit;
        border: 1px solid rgba(127,127,127,0.35); border-radius: 6px; padding: 5px 8px; font: inherit;
      }
      .dsh-voice-check { display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer; }
      .dsh-voice-check input { margin: 0; }
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
      return React.createElement(
        'label',
        { className: 'dsh-voice-check' },
        React.createElement('input', {
          type: 'checkbox',
          checked: !!props.checked,
          onChange: (e) => settingsStore.set({ [props.name]: e.target.checked }),
        }),
        React.createElement('span', null, props.label),
      );
    }

    function SettingsPage(_props) {
      const s = useSettings();
      const tt = useTr();
      const [devices, setDevices] = React.useState([]);
      const [level, setLevel] = React.useState(0);
      const [capture, setCapture] = React.useState(null);
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

      // 快捷鍵錄製
      React.useEffect(() => {
        capturingHotkey = capture;
        if (!capture || typeof window === 'undefined') return;
        const onKey = (e) => {
          e.preventDefault();
          e.stopPropagation();
          const parts = [];
          if (e.ctrlKey) parts.push('Ctrl');
          if (e.altKey) parts.push('Alt');
          if (e.shiftKey) parts.push('Shift');
          if (e.metaKey) parts.push('Meta');
          if (!['Control', 'Alt', 'Shift', 'Meta'].includes(e.code)) parts.push(e.code);
          const parsed = parseHotkey(parts.join('+'));
          if (parsed) {
            settingsStore.set({ hotkeys: { ...settingsStore.get().hotkeys, [capture]: parts.join('+') } });
          }
          capturingHotkey = null;
          setCapture(null);
        };
        window.addEventListener('keydown', onKey, true);
        return () => {
          window.removeEventListener('keydown', onKey, true);
          capturingHotkey = null;
        };
      }, [capture]);

      const fillPct = Math.min(100, Math.round(level * 140));
      const providers = catalog ? catalog.providers : null;
      const records = catalog ? catalog.records : null;
      const defaultLabel = catalog && catalog.defaultProvider
        ? tt('settings.llm.follow', { value: catalog.defaultProvider + (catalog.defaultModel ? ' / ' + catalog.defaultModel : '') })
        : tt('settings.llm.follow.none');

      return React.createElement(
        'div',
        { className: 'dsh-voice-page' },
        React.createElement('div', { className: 'dsh-voice-status' }, tt('settings.status')),
        Row({
          label: tt('settings.input'),
          children: [
            React.createElement(
              'select',
              {
                value: s.inputDeviceId,
                onChange: (e) => settingsStore.set({ inputDeviceId: e.target.value }),
              },
              React.createElement('option', { value: '' }, tt('settings.defaultMic')),
              devices.map((d) => React.createElement('option', { key: d.id, value: d.id }, d.label)),
            ),
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
            React.createElement(
              'select',
              { value: s.recordMode, onChange: (e) => settingsStore.set({ recordMode: e.target.value }) },
              React.createElement('option', { value: 'toggle' }, tt('settings.recordMode.toggle')),
              React.createElement('option', { value: 'ptt' }, tt('settings.recordMode.ptt')),
            ),
          ],
        }),
        Row({
          label: tt('settings.engine'),
          children: [
            React.createElement(
              'select',
              { value: s.engine, onChange: (e) => settingsStore.set({ engine: e.target.value }) },
              React.createElement('option', { value: 'sherpa' }, tt('settings.engine.sherpa')),
              React.createElement('option', { value: 'whisper' }, tt('settings.engine.whisper')),
            ),
          ],
        }),
        React.createElement('div', { className: 'dsh-voice-row' },
          React.createElement('span', { className: 'dsh-voice-row-label' }, tt('settings.hotkeys')),
          React.createElement('div', { style: { flex: 1, display: 'flex', flexDirection: 'column', gap: 6 } },
            React.createElement('div', { className: 'dsh-voice-row' },
              React.createElement('span', { className: 'dsh-voice-kbd' }, s.hotkeys.toggle),
              React.createElement('span', { className: 'dsh-voice-hint' }, tt('settings.hotkeys.toggleHint')),
              React.createElement('button', {
                type: 'button',
                className: 'dsh-voice-btn' + (capture === 'toggle' ? ' capture' : ''),
                onClick: () => setCapture(capture === 'toggle' ? null : 'toggle'),
              }, capture === 'toggle' ? tt('settings.hotkeys.capture') : tt('settings.hotkeys.record')),
            ),
            React.createElement('div', { className: 'dsh-voice-row' },
              React.createElement('span', { className: 'dsh-voice-kbd' }, s.hotkeys.ptt),
              React.createElement('span', { className: 'dsh-voice-hint' }, tt('settings.hotkeys.pttHint')),
              React.createElement('button', {
                type: 'button',
                className: 'dsh-voice-btn' + (capture === 'ptt' ? ' capture' : ''),
                onClick: () => setCapture(capture === 'ptt' ? null : 'ptt'),
              }, capture === 'ptt' ? tt('settings.hotkeys.capture') : tt('settings.hotkeys.record')),
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
          ),
        ),
        React.createElement('div', { className: 'dsh-voice-row' },
          React.createElement('span', { className: 'dsh-voice-row-label' }, tt('settings.llm')),
          React.createElement('div', { style: { flex: 1, display: 'flex', flexDirection: 'column', gap: 8 } },
            React.createElement('div', { className: 'dsh-voice-row' },
              React.createElement('span', { className: 'dsh-voice-hint', style: { flex: '0 0 96px' } }, tt('settings.llm.provider')),
              React.createElement(
                'select',
                {
                  value: s.polishProvider,
                  onChange: (e) => settingsStore.set({ polishProvider: e.target.value, polishModel: '' }),
                },
                React.createElement('option', { value: '' }, defaultLabel),
                providers === null
                  ? React.createElement('option', { value: '', disabled: true }, tt('settings.llm.loading'))
                  : providers.map((p) => React.createElement('option', { key: p.id, value: p.id }, p.name + '（' + p.id + '）')),
              ),
            ),
            React.createElement('div', { className: 'dsh-voice-row' },
              React.createElement('span', { className: 'dsh-voice-hint', style: { flex: '0 0 96px' } }, tt('settings.llm.model')),
              React.createElement(
                'select',
                {
                  value: s.polishModel,
                  onChange: (e) => settingsStore.set({ polishModel: e.target.value }),
                },
                React.createElement('option', { value: '' }, defaultLabel),
                modelList.map((m) => React.createElement('option', { key: m.id, value: m.id }, m.name)),
              ),
            ),
            React.createElement('div', { className: 'dsh-voice-hint' }, tt('settings.llm.keys')),
            React.createElement('div', { className: 'dsh-voice-keys' },
              records === null
                ? React.createElement('div', { className: 'dsh-voice-hint' }, tt('settings.llm.loading'))
                : records.length === 0
                  ? React.createElement('div', { className: 'dsh-voice-hint' }, tt('settings.llm.nokeys'))
                  : records.map((r, i) => React.createElement('div', { key: i, className: 'dsh-voice-keys-item' }, r.key + (r.kind ? '（' + r.kind + '）' : ''))),
            ),
          ),
        ),
      );
    }

    // ---------- Slot 註冊 ----------
    slots.inject('conversation.input.right', () => slots.register(
      { name: 'conversation.input.right', id: 'dsh-voice-input-mic', order: 0, label: '語音輸入' },
      (props) => React.createElement(MicButton, props),
    ));

    slots.inject('settings.section', () => slots.register(
      { name: 'settings.section', id: 'dsh-voice-input', order: 30, label: '語音輸入' },
      (props) => React.createElement(SettingsPage, props),
    ));
  },
};

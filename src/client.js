// dsh-voice-input client 半源碼片段
//
// 本檔由 scripts/build.mjs 與 src/core/*.js 拼成 lib/client.js：
// core 模組函數（sanitizeSettings、sequenceFromString、sequenceMatches、
// isEditableTarget、eventToken、hotkeyLabel、mergeResults、pickDict、
// detectLocaleId）在本片段執行前已注入同一 factory scope。
// 本檔不是獨立 ESM：module/exports/require 由 wrapper 提供。

const PLUGIN = 'dsh-voice-input';
const CHANNEL = '/voice-input';
const MIC_SLOT = 'conversation.input.right';
const MIC_ID = 'dsh-voice-input-mic';

const { jsx, jsxs } = require('react/jsx-runtime');

// ---- 小型工具 ----

function createStore(initial) {
  let snapshot = initial;
  const listeners = new Set();
  return {
    getSnapshot() {
      return snapshot;
    },
    subscribe(cb) {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    set(next) {
      snapshot = next;
      for (const cb of [...listeners]) cb();
    },
  };
}

function decode(res) {
  if (!res || res.ok !== true) {
    const message = res && res.error ? res.error.message : 'RPC failed';
    throw new Error(message);
  }
  return res.value;
}

// ---- Web Speech 辨識器（雲端主引擎，決策 1）----
//
// 每次 onresult 以全量 results 重算草稿並 emit 合併文字；
// onend 且非使用者停止時重啟（Chrome 長靜音會自動斷，坑 #2 對策）；
// not-allowed 權限類視為致命錯誤，no-speech/aborted 可容忍。

function createWebSpeechRecognizer({ lang }) {
  const SR = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
  const texts = new Set();
  const errors = new Set();
  const ends = new Set();
  let recognition = null;
  let userStopped = false;

  function onText(cb) {
    texts.add(cb);
    return () => texts.delete(cb);
  }
  function onError(cb) {
    errors.add(cb);
    return () => errors.delete(cb);
  }
  function onEnd(cb) {
    ends.add(cb);
    return () => ends.delete(cb);
  }

  function startInstance() {
    if (SR === undefined) {
      for (const cb of [...errors]) cb('unsupported');
      return;
    }
    const rec = new SR();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (event) => {
      const results = [];
      for (let i = 0; i < event.results.length; i++) {
        const r = event.results[i];
        if (r && r.length > 0) {
          results.push({ isFinal: r.isFinal === true, transcript: r[0].transcript || '' });
        }
      }
      for (const cb of [...texts]) cb(mergeResults(results).combined);
    };
    rec.onerror = (event) => {
      const name = event && event.error ? event.error : 'unknown';
      if (name === 'not-allowed' || name === 'service-not-allowed') {
        for (const cb of [...errors]) cb(name);
      } else if (name !== 'no-speech' && name !== 'aborted') {
        for (const cb of [...errors]) cb(name);
      }
    };
    rec.onend = () => {
      if (!userStopped) {
        // 非使用者停止：自動重啟（用新實例，跨瀏覽器最穩）
        try {
          startInstance();
        } catch {
          for (const cb of [...ends]) cb();
        }
      } else {
        for (const cb of [...ends]) cb();
      }
    };
    recognition = rec;
    rec.start();
  }

  return {
    start() {
      userStopped = false;
      startInstance();
    },
    stop() {
      userStopped = true;
      const rec = recognition;
      recognition = null;
      if (rec) {
        try {
          rec.stop();
        } catch {
          // 忽略停止階段的例外：資源已釋放
        }
      }
    },
    onText,
    onError,
    onEnd,
  };
}

// ---- 錄音 runtime ----
//
// 狀態機：idle → listening → (polishing) → idle
// 輪次守衛：stop 時 round 遞增，作廢一切遲到回調。
// 決策 9：停麥先徹底關閉錄音資源，再清狀態／輸出。

function createVoiceRuntime({ ctx, settingsStore, statusStore, localeId }) {
  let status = 'idle';
  let partial = '';
  let errorMsg = null;
  let recognizer = null;
  let round = 0;
  let inputActions = null;

  function notify() {
    const settings = settingsStore.getSnapshot();
    statusStore.set({
      status,
      partial,
      error: errorMsg,
      hotkeyLabel: hotkeyLabel(settings.hotkey),
    });
  }

  function attachInputActions(actions) {
    inputActions = actions;
  }

  function writeDraft(text) {
    if (inputActions && typeof inputActions.setDraft === 'function') inputActions.setDraft(text);
  }

  function submitDraft() {
    if (inputActions && typeof inputActions.submit === 'function') inputActions.submit();
  }

  async function callRpc(endpoint, payload) {
    return decode(await ctx.connection.rpc.call(CHANNEL, endpoint, payload));
  }

  async function startMic() {
    if (status !== 'idle') return;
    const roundId = ++round;
    status = 'listening';
    partial = '';
    errorMsg = null;
    notify();
    const settings = settingsStore.getSnapshot();
    const rec = createWebSpeechRecognizer({ lang: settings.lang });
    recognizer = rec;
    rec.onText((text) => {
      if (round !== roundId) return;
      partial = text;
      writeDraft(text); // 串流寫草稿：interim/final 都以全量文字寫入輸入欄
      notify();
    });
    rec.onError((name) => {
      if (round !== roundId) return;
      errorMsg = name;
      void stopMic();
    });
    rec.onEnd(() => {
      if (round !== roundId) return;
      void stopMic();
    });
    try {
      rec.start();
    } catch (err) {
      if (round !== roundId) return;
      recognizer = null;
      status = 'idle';
      errorMsg = String(err && err.message ? err.message : err);
      notify();
    }
  }

  async function stopMic() {
    if (status === 'idle' || status === 'polishing') return;
    const roundId = round;
    round += 1; // 先作廢遲到回調，再關資源（決策 9 的順序鐵律）
    const settings = settingsStore.getSnapshot();
    const text = partial.trim();
    partial = '';
    const rec = recognizer;
    recognizer = null;
    status = text !== '' && settings.polish && !settings.stopOnMute ? 'polishing' : 'idle';
    if (rec) rec.stop(); // 徹底關閉錄音資源
    notify();
    if (settings.stopOnMute || text === '') return;
    if (!settings.polish) {
      writeDraft(text);
      if (settings.autoSend) submitDraft();
      status = 'idle';
      notify();
      return;
    }
    try {
      const result = await callRpc('polish', { text, locale: localeId() });
      writeDraft(result && typeof result.text === 'string' ? result.text : text);
    } catch (err) {
      console.warn('dsh-voice-input: 潤飾失敗，回填原文', err);
      writeDraft(text);
    } finally {
      if (settings.autoSend) submitDraft();
      status = 'idle';
      notify();
    }
  }

  async function toggleMic() {
    if (status === 'idle') await startMic();
    else await stopMic();
  }

  notify();
  return { toggleMic, startMic, stopMic, attachInputActions };
}

// ---- UI 元件 ----

function MicIcon() {
  return jsxs('svg', {
    width: 16,
    height: 16,
    viewBox: '0 0 16 16',
    fill: 'none',
    'aria-hidden': true,
    children: [
      jsx('rect', {
        x: 6.25,
        y: 2,
        width: 3.5,
        height: 6.75,
        rx: 1.75,
        stroke: 'currentColor',
        strokeWidth: 1.5,
      }),
      jsx('path', {
        d: 'M3.5 7.5a4.5 4.5 0 0 0 9 0',
        stroke: 'currentColor',
        strokeWidth: 1.5,
        strokeLinecap: 'round',
      }),
      jsx('path', {
        d: 'M8 12.25v1.75M5.25 14.5h5.5',
        stroke: 'currentColor',
        strokeWidth: 1.5,
        strokeLinecap: 'round',
      }),
    ],
  });
}

function errorText(dict, name) {
  if (name === 'not-allowed' || name === 'service-not-allowed') return dict.errorNotAllowed;
  if (name === 'no-speech') return dict.errorNoSpeech;
  if (name === 'unsupported') return dict.errorUnsupported;
  return dict.errorGeneric;
}

function MicButton(props) {
  const status = props.useStatus ? props.useStatus((v) => v.status) : 'idle';
  const partial = props.useStatus ? props.useStatus((v) => v.partial) : '';
  const error = props.useStatus ? props.useStatus((v) => v.error) : null;
  const label = props.useStatus ? props.useStatus((v) => v.hotkeyLabel) : '';
  const settings = props.useSettings ? props.useSettings((v) => v) : null;
  const dict = props.useDict ? props.useDict((v) => v) : null;
  const mode = settings ? settings.recordingMode : 'toggle';

  // inputActions 是 standard props（點時間快照）：每次 render 重新掛接
  if (props.inputActions && typeof props.attachInputActions === 'function') {
    props.attachInputActions(props.inputActions);
  }

  let title;
  if (status === 'polishing') {
    title = dict.polishing;
  } else if (status === 'listening') {
    title = partial !== '' ? dict.listening + '：' + partial + dict.clickToStop : dict.listening + '…' + dict.clickToStop;
  } else if (error) {
    title = errorText(dict, error);
  } else {
    title = dict.idle + (label !== '' ? '（' + label + '）' : '') + (mode === 'ptt' ? dict.pressAndHold : dict.clickToStart);
  }

  return jsx('button', {
    type: 'button',
    id: MIC_ID,
    className: status === 'listening' ? 'dvi-recording' : status === 'polishing' ? 'dvi-polishing' : '',
    title,
    'aria-label': title,
    onPointerDown: mode === 'ptt' ? props.onStart : undefined,
    onPointerUp: mode === 'ptt' ? props.onStop : undefined,
    onPointerLeave: mode === 'ptt' ? props.onStop : undefined,
    onPointerCancel: mode === 'ptt' ? props.onStop : undefined,
    onClick: mode === 'toggle' ? props.onToggle : undefined,
    children: MicIcon(),
  });
}

// ---- 樣式（官方主題 token；深色由 DSH token 自然適配）----

const STYLE_TEXT = [
  '#dsh-voice-input-mic {',
  '  display: inline-flex; align-items: center; justify-content: center;',
  '  width: 28px; height: 28px; border-radius: 50%;',
  '  border: none; background: transparent; padding: 0; margin: 0;',
  '  color: var(--dsw-alias-label-secondary); cursor: pointer;',
  '  position: relative; flex: none; outline: none;',
  '}',
  '#dsh-voice-input-mic:hover {',
  '  color: var(--dsw-alias-label-primary);',
  '  background: var(--dsw-alias-bg-layer-2);',
  '}',
  '#dsh-voice-input-mic.dvi-recording { color: var(--dsw-alias-state-error-primary); }',
  '#dsh-voice-input-mic.dvi-recording::after {',
  '  content: ""; position: absolute; inset: -3px; border-radius: 50%;',
  '  border: 2px solid var(--dsw-alias-state-error-primary);',
  '  animation: dvi-pulse 1.2s ease-out infinite;',
  '}',
  '#dsh-voice-input-mic.dvi-polishing { opacity: 0.5; }',
  '@keyframes dvi-pulse {',
  '  0% { transform: scale(0.9); opacity: 0.9; }',
  '  70%, 100% { transform: scale(1.35); opacity: 0; }',
  '}',
].join('\n');

// ---- 插件入口 ----

function apply(ctx, config) {
  const settingsStore = createStore(sanitizeSettings({}));
  const dictStore = createStore(pickDict('zh'));
  const statusStore = createStore({ status: 'idle', partial: '', error: null, hotkeyLabel: '' });

  // 決策 5：UI 語言跟隨 DSH locale
  const locale = ctx.get('locale');
  const localeId = () => {
    if (!locale) return 'zh';
    const snap = typeof locale.getSnapshot === 'function' ? locale.getSnapshot() : typeof locale.getLocale === 'function' ? locale.getLocale() : null;
    return detectLocaleId(snap);
  };
  dictStore.set(pickDict(localeId()));
  if (locale && typeof locale.subscribe === 'function') {
    ctx.effect(
      () =>
        locale.subscribe(() => {
          dictStore.set(pickDict(localeId()));
        }),
      'dsh-voice-input: locale follow',
    );
  }

  const runtime = createVoiceRuntime({ ctx, settingsStore, statusStore, localeId });

  // host 下發設定（行內 config 只傳 host 半；client 半經 RPC 同步）
  ctx.connection.rpc
    .call(CHANNEL, 'config', {})
    .then((res) => {
      const value = decode(res);
      settingsStore.set(sanitizeSettings(value));
      const snap = statusStore.getSnapshot();
      statusStore.set({ ...snap, hotkeyLabel: hotkeyLabel(settingsStore.getSnapshot().hotkey) });
    })
    .catch((err) => {
      console.warn('dsh-voice-input: /voice-input.config 不可用，使用預設設定', err);
    });

  // 麥克風按鈕 slot（決策 2：conversation.input.right）
  ctx.slots.inject(
    MIC_SLOT,
    () =>
      ctx.slots.register(
        {
          name: MIC_SLOT,
          id: MIC_ID,
          order: 0,
          inject: () => ({
            onToggle: () => {
              runtime.toggleMic().catch((err) => console.warn('dsh-voice-input: mic toggle', err));
            },
            onStart: () => {
              runtime.startMic().catch((err) => console.warn('dsh-voice-input: mic start', err));
            },
            onStop: () => {
              runtime.stopMic().catch((err) => console.warn('dsh-voice-input: mic stop', err));
            },
            attachInputActions: (actions) => runtime.attachInputActions(actions),
            hooks: {
              status: statusStore,
              settings: settingsStore,
              dict: dictStore,
            },
          }),
        },
        MicButton,
      ),
  );

  // 快捷鍵序列（決策 6：任意長度按鍵序列、順序感應、輸入框聚焦不搶）
  ctx.effect(() => {
    let buffer = [];
    const onKey = (event) => {
      if (event.repeat) return;
      if (isEditableTarget(event.target)) return;
      const settings = settingsStore.getSnapshot();
      const targets = [sequenceFromString(settings.hotkey), sequenceFromString(settings.hotkeyAlt)].filter((t) => t.length > 0);
      if (targets.length === 0) return;
      const maxLen = Math.max(...targets.map((t) => t.length));
      const token = eventToken(event);
      buffer.push(token);
      const matched = targets.find((t) => sequenceMatches(buffer, t));
      if (matched) {
        buffer = [];
        event.preventDefault();
        runtime.toggleMic().catch((err) => console.warn('dsh-voice-input: hotkey mic', err));
        return;
      }
      if (buffer.length > maxLen) buffer.splice(0, buffer.length - maxLen);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, 'dsh-voice-input: hotkey sequences');

  // 樣式注入（無 styles builtin；cleanup 移除）
  ctx.effect(() => {
    const el = document.createElement('style');
    el.id = 'dsh-voice-input-style';
    el.textContent = STYLE_TEXT;
    document.head.appendChild(el);
    return () => el.remove();
  }, 'dsh-voice-input: styles');
}

module.exports = { name: PLUGIN, inject: ['sessions', 'slots', 'connection'], apply };

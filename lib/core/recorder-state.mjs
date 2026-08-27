// recorder-state.mjs — 錄音流程狀態機（平台無關純邏輯）

export const RECORDER_STATES = Object.freeze([
  'idle',
  'starting',
  'recording',
  'finalizing',
  'transcribing',
]);

export const RECORDER_EVENTS = Object.freeze(['begin', 'ready', 'end', 'finish', 'reset']);

// 合法轉移表；未列出的轉移一律視為非法，回 idle 並回報。
const TRANSITIONS = {
  idle: { begin: 'starting', reset: 'idle' },
  starting: { ready: 'recording', reset: 'idle' },
  recording: { end: 'finalizing', reset: 'idle' },
  finalizing: { finish: 'transcribing', reset: 'idle' },
  transcribing: { reset: 'idle' },
};

// 回傳 { state, ok }；ok=false 表示非法轉移（狀態已回 idle）。
export function transition(state, event) {
  if (!RECORDER_STATES.includes(state) || !RECORDER_EVENTS.includes(event)) {
    return { state: 'idle', ok: false };
  }
  const next = TRANSITIONS[state]?.[event];
  if (next === undefined) return { state: 'idle', ok: false };
  return { state: next, ok: true };
}

export function isRecording(state) {
  return state === 'recording';
}

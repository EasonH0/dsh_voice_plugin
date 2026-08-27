import { test } from 'node:test';
import assert from 'node:assert/strict';
import { transition, isRecording } from '../src/core/recorder-state.mjs';

test('完整正常流程', () => {
  let s = 'idle';
  for (const [event, expected] of [
    ['begin', 'starting'],
    ['ready', 'recording'],
    ['end', 'finalizing'],
    ['finish', 'transcribing'],
    ['reset', 'idle'],
  ]) {
    const r = transition(s, event);
    assert.ok(r.ok, `${s} + ${event} 應合法`);
    s = r.state;
    assert.equal(s, expected);
  }
});

test('recording 中斷（reset）', () => {
  let r = transition('idle', 'begin');
  r = transition(r.state, 'ready');
  assert.equal(r.state, 'recording');
  r = transition(r.state, 'reset');
  assert.ok(r.ok);
  assert.equal(r.state, 'idle');
});

test('非法轉移回 idle 且 ok=false', () => {
  const cases = [
    ['idle', 'end'],
    ['idle', 'finish'],
    ['recording', 'begin'],
    ['transcribing', 'end'],
  ];
  for (const [state, event] of cases) {
    const r = transition(state, event);
    assert.equal(r.ok, false, `${state} + ${event} 應為非法`);
    assert.equal(r.state, 'idle');
  }
});

test('未知狀態/事件回 idle 且 ok=false', () => {
  assert.deepEqual(transition('flying', 'begin'), { state: 'idle', ok: false });
  assert.deepEqual(transition('idle', 'teleport'), { state: 'idle', ok: false });
});

test('isRecording', () => {
  assert.ok(isRecording('recording'));
  assert.ok(!isRecording('idle'));
  assert.ok(!isRecording('finalizing'));
});

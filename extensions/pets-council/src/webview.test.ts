import assert from 'node:assert/strict';
import test from 'node:test';
import type { CouncilTurn } from './domain';
import { reviewMockTurn } from './mockCouncil';
import type { CodexRuntimeStatus } from './runtime/types';
import { SAMPLE_COUNCIL_TURN } from './sampleTurn';
import { renderCouncilHtml } from './webview';

const IDLE_TURN = { phase: 'idle' as const, message: 'No Codex turn has been started in this session.' };
const NO_THREAD = { phase: 'none' as const, message: 'No Codex thread exists for this runtime connection.' };
const DISCONNECTED: CodexRuntimeStatus = { phase: 'disconnected', binary: 'codex', message: 'Disconnected.', thread: NO_THREAD, turn: IDLE_TURN };
const THREAD_READY: CodexRuntimeStatus = { phase: 'ready', binary: 'codex', message: 'Connected.', thread: { phase: 'ready', message: 'Thread ready.', thread: { id: 'thread-1234567890', model: 'gpt-test' } }, turn: IDLE_TURN };
const STREAMING: CodexRuntimeStatus = { ...THREAD_READY, turn: { phase: 'streaming', message: 'Codex is responding…', turnId: 'turn-1', userMessage: 'Hello', assistantMessage: 'Hi there' } };
const EMPTY: CouncilTurn = { ...SAMPLE_COUNCIL_TURN, capture: { mode: 'live', capturedAt: '2026-07-25T13:35:14Z', warnings: [] }, userMessage: 'placeholder', assistantResponse: 'placeholder', workspace: {}, git: undefined };
const REAL: CouncilTurn = { ...EMPTY, turnId: 'turn-real-123456', userMessage: 'Real question', assistantResponse: 'Real answer', runtime: { source: 'codex', threadId: 'thread-1', turnId: 'turn-real-123456' } };

test('keeps empty project onboarding and runtime controls', () => {
  const html = renderCouncilHtml(EMPTY, reviewMockTurn(EMPTY), DISCONNECTED, 'nonce');
  assert.match(html, /No project context yet/);
  assert.match(html, /Connect Codex/);
  assert.doesNotMatch(html, /id="council-composer"/);
});

test('shows a Codex composer only after a thread is ready', () => {
  const ready = renderCouncilHtml(SAMPLE_COUNCIL_TURN, reviewMockTurn(SAMPLE_COUNCIL_TURN), THREAD_READY, 'nonce');
  assert.match(ready, /id="codex-composer"/);
  assert.match(ready, /Send to Codex/);
});

test('renders streaming messages and disables duplicate sending', () => {
  const html = renderCouncilHtml(SAMPLE_COUNCIL_TURN, reviewMockTurn(SAMPLE_COUNCIL_TURN), STREAMING, 'nonce');
  assert.match(html, />Hello</);
  assert.match(html, />Hi there</);
  assert.match(html, /id="send-codex-turn" disabled/);
});

test('identifies a Council review backed by a completed Codex turn', () => {
  const html = renderCouncilHtml(REAL, reviewMockTurn(REAL), THREAD_READY, 'nonce');
  assert.match(html, /Completed Codex turn review/);
  assert.match(html, /Real Codex turn/);
  assert.match(html, /Real question/);
  assert.match(html, /Real answer/);
  assert.doesNotMatch(html, /Deterministic workspace review/);
});

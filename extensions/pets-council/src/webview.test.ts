import assert from 'node:assert/strict';
import test from 'node:test';
import type { CouncilTurn } from './domain';
import { reviewMockTurn } from './mockCouncil';
import type { CodexRuntimeStatus } from './runtime/types';
import { SAMPLE_COUNCIL_TURN } from './sampleTurn';
import { renderCouncilHtml } from './webview';

const IDLE = { phase: 'idle' as const, message: 'No turn.' };
const READY_NO_THREAD: CodexRuntimeStatus = {
  phase: 'ready',
  binary: 'codex',
  message: 'Connected.',
  thread: { phase: 'none', message: 'No thread.' },
  turn: IDLE,
  resumeCandidate: { threadId: 'thread-saved-1234567890', savedAt: 50 }
};
const THREAD_READY: CodexRuntimeStatus = {
  phase: 'ready',
  binary: 'codex',
  message: 'Connected.',
  thread: { phase: 'ready', message: 'Thread ready.', thread: { id: 'thread-1' } },
  turn: IDLE,
  resumeCandidate: { threadId: 'thread-1', savedAt: 50 }
};
const RESTORED: CodexRuntimeStatus = {
  ...THREAD_READY,
  thread: {
    phase: 'ready',
    message: 'Saved thread resumed with its last completed exchange.',
    thread: { id: 'thread-saved-1234567890' }
  },
  turn: {
    phase: 'completed',
    message: 'Restored the last completed turn from this Codex session.',
    turnId: 'turn-restored',
    userMessage: 'Resume this work',
    assistantMessage: 'The previous exchange is back.'
  }
};
const STREAMING: CodexRuntimeStatus = {
  ...THREAD_READY,
  turn: {
    phase: 'streaming',
    message: 'Codex is responding…',
    turnId: 'turn-1',
    userMessage: 'Hello',
    assistantMessage: 'Working'
  }
};
const APPROVAL: CodexRuntimeStatus = {
  ...STREAMING,
  approval: {
    requestId: 'approval-1',
    kind: 'commandExecution',
    threadId: 'thread-1',
    turnId: 'turn-1',
    itemId: 'item-1',
    command: 'npm test',
    cwd: '/workspace',
    reason: 'Run tests'
  }
};
const EMPTY: CouncilTurn = {
  ...SAMPLE_COUNCIL_TURN,
  capture: { mode: 'live', capturedAt: '2026-07-25T13:35:14Z', warnings: [] },
  userMessage: 'placeholder',
  assistantResponse: 'placeholder',
  workspace: {},
  git: undefined
};

test('keeps empty onboarding', () => {
  const html = renderCouncilHtml(
    EMPTY,
    reviewMockTurn(EMPTY),
    {
      phase: 'disconnected',
      binary: 'codex',
      message: 'Disconnected.',
      thread: { phase: 'none', message: 'No thread.' },
      turn: IDLE
    },
    'nonce'
  );
  assert.match(html, /No project context yet/);
});

test('offers saved-session resume separately from starting a new session', () => {
  const html = renderCouncilHtml(
    SAMPLE_COUNCIL_TURN,
    reviewMockTurn(SAMPLE_COUNCIL_TURN),
    READY_NO_THREAD,
    'nonce'
  );

  assert.match(html, /Resume saved session/);
  assert.match(html, /Start new session/);
  assert.match(html, /Saved thread thread-s…7890/);
});

test('renders the restored completed exchange and keeps the composer usable', () => {
  const html = renderCouncilHtml(
    SAMPLE_COUNCIL_TURN,
    reviewMockTurn(SAMPLE_COUNCIL_TURN),
    RESTORED,
    'nonce'
  );

  assert.match(html, /Restored primary assistant/);
  assert.match(html, /Resume this work/);
  assert.match(html, /The previous exchange is back/);
  assert.match(html, /id="send-codex-turn"/);
  assert.doesNotMatch(html, /Resume saved session/);
});

test('shows Stop instead of duplicate Send during a turn', () => {
  const html = renderCouncilHtml(
    SAMPLE_COUNCIL_TURN,
    reviewMockTurn(SAMPLE_COUNCIL_TURN),
    STREAMING,
    'nonce'
  );
  assert.match(html, /id="interrupt-codex-turn"/);
  assert.doesNotMatch(html, /id="send-codex-turn"/);
});

test('renders command approval with explicit allow and deny actions', () => {
  const html = renderCouncilHtml(
    SAMPLE_COUNCIL_TURN,
    reviewMockTurn(SAMPLE_COUNCIL_TURN),
    APPROVAL,
    'nonce'
  );
  assert.match(html, /Command approval required/);
  assert.match(html, /npm test/);
  assert.match(html, /Allow once/);
  assert.match(html, /Deny/);
});

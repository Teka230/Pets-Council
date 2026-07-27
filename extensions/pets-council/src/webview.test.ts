import assert from 'node:assert/strict';
import test from 'node:test';
import type { CouncilTurn } from './domain';
import { reviewMockTurn } from './mockCouncil';
import type { CodexRuntimeStatus } from './runtime/types';
import { SAMPLE_COUNCIL_TURN } from './sampleTurn';
import { renderCouncilHtml } from './webview';

const DISCONNECTED_RUNTIME: CodexRuntimeStatus = {
  phase: 'disconnected',
  binary: 'codex',
  message: 'Disconnected. Connecting is always an explicit user action.',
  thread: {
    phase: 'none',
    message: 'No Codex thread exists for this runtime connection.'
  }
};

const READY_RUNTIME: CodexRuntimeStatus = {
  phase: 'ready',
  binary: '/usr/local/bin/codex',
  message: 'Connected. No thread has been created and no prompt has been sent.',
  server: {
    userAgent: 'codex/0.1',
    platformFamily: 'unix',
    platformOs: 'darwin'
  },
  thread: {
    phase: 'none',
    message: 'No Codex thread exists for this runtime connection.'
  }
};

const THREAD_READY_RUNTIME: CodexRuntimeStatus = {
  ...READY_RUNTIME,
  thread: {
    phase: 'ready',
    message: 'Thread ready. No turn has been started and no prompt has been sent.',
    thread: {
      id: '0198-long-codex-thread-id-0001',
      sessionId: 'session-1',
      cwd: '/workspace',
      model: 'gpt-test',
      modelProvider: 'openai',
      approvalsReviewer: 'user'
    }
  }
};

const EMPTY_LIVE_TURN: CouncilTurn = {
  ...SAMPLE_COUNCIL_TURN,
  capture: {
    mode: 'live',
    capturedAt: '2026-07-25T13:35:14.000Z',
    warnings: [
      'No active editor was available when the context was captured.',
      'Open a folder or workspace to include Git context.'
    ]
  },
  userMessage: 'Review the current workspace context and suggest the next useful step.',
  assistantResponse: 'The live workspace context was captured.',
  workspace: {},
  git: undefined
};

test('renders onboarding instead of suggestions without evidence', () => {
  const html = renderCouncilHtml(
    EMPTY_LIVE_TURN,
    reviewMockTurn(EMPTY_LIVE_TURN),
    DISCONNECTED_RUNTIME,
    'test-nonce'
  );

  assert.match(html, /No project context yet/);
  assert.match(html, /Open folder/);
  assert.match(html, /Waiting for project context/);
  assert.match(html, /Nothing to review/);
  assert.match(html, /Nothing to sequence/);
  assert.match(html, /Nothing to preserve/);
  assert.match(html, /Connect Codex/);
  assert.doesNotMatch(html, /id="council-composer"/);
  assert.doesNotMatch(html, /something useful to add/);
  assert.doesNotMatch(html, / UTC/);
});

test('keeps the interactive composer when evidence exists', () => {
  const html = renderCouncilHtml(
    SAMPLE_COUNCIL_TURN,
    reviewMockTurn(SAMPLE_COUNCIL_TURN),
    DISCONNECTED_RUNTIME,
    'test-nonce'
  );

  assert.match(html, /id="council-composer"/);
  assert.match(html, /Live council review/);
  assert.match(html, /Not connected/);
});

test('renders a completed runtime handshake without implying a thread exists', () => {
  const html = renderCouncilHtml(
    SAMPLE_COUNCIL_TURN,
    reviewMockTurn(SAMPLE_COUNCIL_TURN),
    READY_RUNTIME,
    'test-nonce'
  );

  assert.match(html, /Handshake complete/);
  assert.match(html, /No Codex thread exists/);
  assert.match(html, /Start Codex session/);
  assert.match(html, /codex\/0\.1/);
  assert.match(html, /Disconnect/);
  assert.doesNotMatch(html, /Connect Codex/);
});

test('renders the active thread without implying that a turn ran', () => {
  const html = renderCouncilHtml(
    SAMPLE_COUNCIL_TURN,
    reviewMockTurn(SAMPLE_COUNCIL_TURN),
    THREAD_READY_RUNTIME,
    'test-nonce'
  );

  assert.match(html, /Thread ready/);
  assert.match(html, /No turn has been started/);
  assert.match(html, /New Codex session/);
  assert.match(html, /gpt-test/);
  assert.match(html, /0198-lon…0001/);
});

test('renders a retry action after a runtime error', () => {
  const html = renderCouncilHtml(
    EMPTY_LIVE_TURN,
    reviewMockTurn(EMPTY_LIVE_TURN),
    {
      phase: 'error',
      binary: 'codex',
      message: 'binary not found',
      thread: {
        phase: 'none',
        message: 'No Codex thread exists for this runtime connection.'
      }
    },
    'test-nonce'
  );

  assert.match(html, /Connection failed/);
  assert.match(html, /binary not found/);
  assert.match(html, /Retry connection/);
});

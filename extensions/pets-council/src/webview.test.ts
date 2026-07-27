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
  message: 'Disconnected. Connecting is always an explicit user action.'
};

const READY_RUNTIME: CodexRuntimeStatus = {
  phase: 'ready',
  binary: '/usr/local/bin/codex',
  message: 'Connected. No thread has been created and no prompt has been sent.',
  server: {
    userAgent: 'codex/0.1',
    platformFamily: 'unix',
    platformOs: 'darwin'
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
  assert.match(html, /No thread has been created/);
  assert.match(html, /codex\/0\.1/);
  assert.match(html, /Disconnect/);
  assert.doesNotMatch(html, /Connect Codex/);
});

test('renders a retry action after a runtime error', () => {
  const html = renderCouncilHtml(
    EMPTY_LIVE_TURN,
    reviewMockTurn(EMPTY_LIVE_TURN),
    {
      phase: 'error',
      binary: 'codex',
      message: 'binary not found'
    },
    'test-nonce'
  );

  assert.match(html, /Connection failed/);
  assert.match(html, /binary not found/);
  assert.match(html, /Retry connection/);
});

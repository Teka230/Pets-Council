import assert from 'node:assert/strict';
import test from 'node:test';
import { SAMPLE_COUNCIL_TURN } from '../sampleTurn';
import { buildCouncilTurnFromCompletedCodexTurn } from './councilBridge';
import type { CodexRuntimeStatus } from './types';

const COMPLETED: CodexRuntimeStatus = {
  phase: 'ready',
  binary: 'codex',
  message: 'Connected.',
  models: [],
  thread: {
    phase: 'ready',
    message: 'Thread ready.',
    thread: { id: 'thread-1' }
  },
  turn: {
    phase: 'completed',
    message: 'Codex completed the turn.',
    turnId: 'turn-1',
    userMessage: 'What should we build next?',
    assistantMessage: 'Build the smallest tested slice.',
    completedAt: 123
  }
};

test('builds a CouncilTurn from a completed Codex turn', () => {
  const turn = buildCouncilTurnFromCompletedCodexTurn(SAMPLE_COUNCIL_TURN, COMPLETED);
  assert.ok(turn);
  assert.equal(turn.turnId, 'turn-1');
  assert.equal(turn.userMessage, 'What should we build next?');
  assert.equal(turn.assistantResponse, 'Build the smallest tested slice.');
  assert.deepEqual(turn.runtime, {
    source: 'codex',
    threadId: 'thread-1',
    turnId: 'turn-1',
    completedAt: 123
  });
  assert.equal(turn.workspace.activeFile, SAMPLE_COUNCIL_TURN.workspace.activeFile);
});

test('does not bridge partial or empty turns', () => {
  assert.equal(buildCouncilTurnFromCompletedCodexTurn(SAMPLE_COUNCIL_TURN, {
    ...COMPLETED,
    turn: { ...COMPLETED.turn, phase: 'streaming' }
  }), undefined);
  assert.equal(buildCouncilTurnFromCompletedCodexTurn(SAMPLE_COUNCIL_TURN, {
    ...COMPLETED,
    turn: { ...COMPLETED.turn, assistantMessage: '' }
  }), undefined);
});

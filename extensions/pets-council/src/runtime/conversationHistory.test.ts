import assert from 'node:assert/strict';
import test from 'node:test';
import { projectConversationHistory } from './conversationHistory';
import type { CodexRuntimeStatus } from './types';

const baseRuntime: CodexRuntimeStatus = {
  phase: 'ready',
  binary: 'codex',
  message: 'Connected.',
  models: [],
  thread: {
    phase: 'ready',
    message: 'Thread ready.',
    thread: { id: 'thread-1', completedTurns: [] }
  },
  turn: { phase: 'idle', message: 'Idle.' }
};

test('restores all completed turns when the active thread changes', () => {
  const restored = [
    { turnId: 'turn-1', userMessage: 'One', assistantMessage: 'First' },
    { turnId: 'turn-2', userMessage: 'Two', assistantMessage: 'Second' }
  ];
  const result = projectConversationHistory(
    { threadId: 'other', turns: [] },
    { ...baseRuntime, thread: { ...baseRuntime.thread, thread: { id: 'thread-1', completedTurns: restored } } }
  );
  assert.deepEqual(result.turns, restored);
});

test('appends a newly completed live turn only once', () => {
  const runtime: CodexRuntimeStatus = {
    ...baseRuntime,
    turn: {
      phase: 'completed',
      message: 'Done.',
      turnId: 'turn-3',
      userMessage: 'Three',
      assistantMessage: 'Third'
    }
  };
  const first = projectConversationHistory({ threadId: 'thread-1', turns: [] }, runtime);
  const second = projectConversationHistory(first, runtime);
  assert.equal(second.turns.length, 1);
  assert.equal(second.turns[0]?.turnId, 'turn-3');
});

test('clears history when no thread is active', () => {
  const result = projectConversationHistory(
    { threadId: 'thread-1', turns: [{ turnId: 'turn-1', userMessage: 'One', assistantMessage: 'First' }] },
    { ...baseRuntime, thread: { phase: 'none', message: 'No thread.' } }
  );
  assert.deepEqual(result, { turns: [] });
});

import type { CodexRestoredTurn, CodexRuntimeStatus } from './types';

const MAX_VISIBLE_TURNS = 100;

export type ConversationHistoryState = Readonly<{
  threadId?: string;
  turns: readonly CodexRestoredTurn[];
}>;

export function projectConversationHistory(
  previous: ConversationHistoryState,
  runtime: CodexRuntimeStatus
): ConversationHistoryState {
  const thread = runtime.thread.thread;
  if (!thread) {
    return runtime.thread.phase === 'none' ? { turns: [] } : previous;
  }

  const base = thread.id === previous.threadId
    ? [...previous.turns]
    : [...(thread.completedTurns ?? [])];

  const active = completedTurn(runtime);
  if (active) {
    const index = base.findIndex((turn) => turn.turnId === active.turnId);
    if (index >= 0) base[index] = active;
    else base.push(active);
  }

  return { threadId: thread.id, turns: base.slice(-MAX_VISIBLE_TURNS) };
}

function completedTurn(runtime: CodexRuntimeStatus): CodexRestoredTurn | undefined {
  const turn = runtime.turn;
  if (turn.phase !== 'completed' || !turn.turnId || !turn.userMessage?.trim() || !turn.assistantMessage?.trim()) {
    return undefined;
  }
  return {
    turnId: turn.turnId,
    userMessage: turn.userMessage.trim(),
    assistantMessage: turn.assistantMessage.trim(),
    startedAt: turn.startedAt,
    completedAt: turn.completedAt
  };
}

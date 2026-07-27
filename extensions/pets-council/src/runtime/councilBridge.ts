import type { CouncilTurn } from '../domain';
import type { CodexRuntimeStatus } from './types';

export function buildCouncilTurnFromCompletedCodexTurn(
  context: CouncilTurn,
  runtime: CodexRuntimeStatus
): CouncilTurn | undefined {
  const thread = runtime.thread.thread;
  const turn = runtime.turn;
  const userMessage = turn.userMessage?.trim();
  const assistantResponse = turn.assistantMessage?.trim();

  if (
    runtime.phase !== 'ready'
    || runtime.thread.phase !== 'ready'
    || !thread
    || turn.phase !== 'completed'
    || !turn.turnId
    || !userMessage
    || !assistantResponse
  ) {
    return undefined;
  }

  return {
    ...context,
    turnId: turn.turnId,
    userMessage,
    assistantResponse,
    runtime: {
      source: 'codex',
      threadId: thread.id,
      turnId: turn.turnId,
      completedAt: turn.completedAt
    }
  };
}

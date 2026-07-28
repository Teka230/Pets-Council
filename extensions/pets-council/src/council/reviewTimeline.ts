import type { CouncilReview, CouncilReviewState, CouncilSuggestion, CouncilTurn } from '../domain';

const MAX_REVIEWED_TURNS = 50;

export type CouncilTurnReviewEntry = Readonly<{
  turn: CouncilTurn;
  review: CouncilReview;
  state: CouncilReviewState;
}>;

export function upsertCouncilTurnReview(
  previous: readonly CouncilTurnReviewEntry[],
  entry: CouncilTurnReviewEntry
): readonly CouncilTurnReviewEntry[] {
  if (entry.turn.runtime?.source !== 'codex') return previous;
  const next = previous.filter((candidate) => candidate.turn.turnId !== entry.turn.turnId);
  next.push(entry);
  return next.slice(-MAX_REVIEWED_TURNS);
}

export function findCouncilTimelineSuggestion(
  entries: readonly CouncilTurnReviewEntry[],
  suggestionId: string
): { entry: CouncilTurnReviewEntry; suggestion: CouncilSuggestion } | undefined {
  for (let index = entries.length - 1; index >= 0; index--) {
    const entry = entries[index];
    for (const role of entry.review.roles) {
      const suggestion = role.suggestions.find((candidate) => candidate.id === suggestionId);
      if (suggestion) return { entry, suggestion };
    }
  }
  return undefined;
}

import assert from 'node:assert/strict';
import test from 'node:test';
import type { CouncilReview, CouncilReviewState, CouncilTurn } from '../domain';
import {
  findCouncilTimelineSuggestion,
  hydrateCouncilReviewTimeline,
  isPersistableCouncilTurnReview,
  serializeCouncilReviewTimeline,
  upsertCouncilTurnReview
} from './reviewTimeline';
import { CouncilReviewTimelineStore, type ReviewTimelineMemento } from './reviewTimelineStore';

const turn = (turnId: string): CouncilTurn => ({
  turnId,
  userMessage: `Question ${turnId}`,
  assistantResponse: `Answer ${turnId}`,
  capture: { mode: 'live', capturedAt: new Date(0).toISOString(), warnings: [] },
  workspace: { name: 'demo' },
  runtime: { source: 'codex', threadId: 'thread-1', turnId }
});
const review = (turnId: string, title: string): CouncilReview => ({
  turnId,
  roles: [
    {
      role: 'architect',
      suggestions: [{
        id: `suggestion-${turnId}`,
        role: 'architect',
        title,
        rationale: 'Why',
        prompt: 'Do it',
        actionLabel: 'Use in Codex'
      }]
    },
    { role: 'guardian', suggestions: [] },
    { role: 'strategist', suggestions: [] },
    { role: 'notetaker', suggestions: [] }
  ]
});
const state = (turnId: string, phase: CouncilReviewState['phase'] = 'ready'): CouncilReviewState => ({
  phase,
  provider: 'codex',
  message: 'Done',
  turnId
});

class MemoryMemento implements ReviewTimelineMemento {
  readonly values = new Map<string, unknown>();
  get<T>(key: string): T | undefined { return this.values.get(key) as T | undefined; }
  update(key: string, value: unknown): Thenable<void> {
    if (value === undefined) this.values.delete(key);
    else this.values.set(key, value);
    return Promise.resolve();
  }
}

test('replaces the review for the same Codex turn', () => {
  const first = { turn: turn('1'), review: review('1', 'Old'), state: state('1') };
  const second = { turn: turn('1'), review: review('1', 'New'), state: state('1') };
  const result = upsertCouncilTurnReview(upsertCouncilTurnReview([], first), second);
  assert.equal(result.length, 1);
  assert.equal(result[0]?.review.roles[0]?.suggestions[0]?.title, 'New');
});

test('finds suggestions from older reviewed turns', () => {
  const entries = upsertCouncilTurnReview(
    upsertCouncilTurnReview([], { turn: turn('1'), review: review('1', 'One'), state: state('1') }),
    { turn: turn('2'), review: review('2', 'Two'), state: state('2') }
  );
  const found = findCouncilTimelineSuggestion(entries, 'suggestion-1');
  assert.equal(found?.entry.turn.turnId, '1');
  assert.equal(found?.suggestion.title, 'One');
});

test('ignores non-Codex context reviews', () => {
  const contextTurn = { ...turn('context'), runtime: undefined };
  const result = upsertCouncilTurnReview([], {
    turn: contextTurn,
    review: review('context', 'Context'),
    state: state('context')
  });
  assert.deepEqual(result, []);
});

test('persists only completed Codex reviews and restores suggestion actions', async () => {
  const reviewing = { turn: turn('1'), review: review('1', 'Pending'), state: state('1', 'reviewing') };
  const ready = { turn: turn('1'), review: review('1', 'Ready'), state: state('1', 'ready') };
  const context = {
    turn: { ...turn('context'), runtime: undefined },
    review: review('context', 'Context'),
    state: state('context')
  };

  assert.equal(isPersistableCouncilTurnReview(reviewing), false);
  assert.equal(isPersistableCouncilTurnReview(ready), true);
  assert.equal(isPersistableCouncilTurnReview(context), false);

  const memento = new MemoryMemento();
  const store = new CouncilReviewTimelineStore(memento);
  await store.save('workspace-a', [reviewing, ready, context]);

  const loaded = store.load('workspace-a');
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0]?.review.roles[0]?.suggestions[0]?.title, 'Ready');
  assert.equal(loaded[0]?.review.roles[0]?.suggestions[0]?.prompt, 'Do it');
  assert.equal(loaded[0]?.review.roles[0]?.suggestions[0]?.actionLabel, 'Use in Codex');
  assert.equal(findCouncilTimelineSuggestion(loaded, 'suggestion-1')?.suggestion.title, 'Ready');
});

test('ignores malformed persisted timeline payloads', () => {
  assert.deepEqual(hydrateCouncilReviewTimeline(undefined), []);
  assert.deepEqual(hydrateCouncilReviewTimeline({ version: 99, entries: [] }), []);
  assert.deepEqual(hydrateCouncilReviewTimeline({ version: 1, entries: [{ turn: null }] }), []);
  const roundTrip = hydrateCouncilReviewTimeline(
    serializeCouncilReviewTimeline([{ turn: turn('9'), review: review('9', 'Nine'), state: state('9') }])
  );
  assert.equal(roundTrip.length, 1);
  assert.equal(roundTrip[0]?.turn.turnId, '9');
});

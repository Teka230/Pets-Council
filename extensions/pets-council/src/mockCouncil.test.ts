import assert from 'node:assert/strict';
import test from 'node:test';
import { COUNCIL_ROLE_IDS, type CouncilTurn } from './domain';
import { reviewMockTurn } from './mockCouncil';
import { SAMPLE_COUNCIL_TURN } from './sampleTurn';

test('returns every role in a stable order', () => {
  const review = reviewMockTurn(SAMPLE_COUNCIL_TURN);

  assert.deepEqual(
    review.roles.map((role) => role.role),
    COUNCIL_ROLE_IDS
  );
});

test('is deterministic for the same turn', () => {
  assert.deepEqual(
    reviewMockTurn(SAMPLE_COUNCIL_TURN),
    reviewMockTurn(SAMPLE_COUNCIL_TURN)
  );
});

test('returns zero to two suggestions per role', () => {
  const review = reviewMockTurn(SAMPLE_COUNCIL_TURN);

  for (const role of review.roles) {
    assert.ok(role.suggestions.length >= 0);
    assert.ok(role.suggestions.length <= 2);
  }
});

test('supports a silent role without treating it as an error', () => {
  const review = reviewMockTurn(SAMPLE_COUNCIL_TURN);
  const strategist = review.roles.find((role) => role.role === 'strategist');

  assert.ok(strategist);
  assert.deepEqual(strategist.suggestions, []);
});

test('guardian returns two suggestions when files and an active editor are present', () => {
  const review = reviewMockTurn(SAMPLE_COUNCIL_TURN);
  const guardian = review.roles.find((role) => role.role === 'guardian');

  assert.ok(guardian);
  assert.equal(guardian.suggestions.length, 2);
});

test('notetaker stays silent when there is no assistant response', () => {
  const turn: CouncilTurn = {
    ...SAMPLE_COUNCIL_TURN,
    assistantResponse: ''
  };
  const review = reviewMockTurn(turn);
  const notetaker = review.roles.find((role) => role.role === 'notetaker');

  assert.ok(notetaker);
  assert.deepEqual(notetaker.suggestions, []);
});

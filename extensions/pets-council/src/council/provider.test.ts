import assert from 'node:assert/strict';
import test from 'node:test';
import { CodexCouncilProvider, buildCouncilPrompt, parseCouncilReview } from './provider';
import { SAMPLE_COUNCIL_TURN } from '../sampleTurn';

const REAL_TURN = {
  ...SAMPLE_COUNCIL_TURN,
  runtime: { source: 'codex' as const, threadId: 'thread-1', turnId: 'turn-1' },
  projectContext: { summary: 'Decision: keep actions explicit.', sources: ['docs/roadmap.md'], graphNodeCount: 4, graphEdgeCount: 5 }
};

test('parses zero to two suggestions in stable role order', () => {
  const review = parseCouncilReview(JSON.stringify({
    architect: [{ title: 'A', rationale: 'R', prompt: 'P' }, { title: 'B', rationale: 'R2', prompt: 'P2' }, { title: 'ignored', rationale: 'x', prompt: 'y' }],
    guardian: [], strategist: [], notetaker: []
  }), 'turn-1');
  assert.deepEqual(review.roles.map((role) => role.role), ['architect','guardian','strategist','notetaker']);
  assert.equal(review.roles[0].suggestions.length, 2);
});

test('builds one shared prompt with graph projection', () => {
  const prompt = buildCouncilPrompt(REAL_TURN);
  assert.match(prompt, /PRIMARY CODEX RESPONSE/);
  assert.match(prompt, /Decision: keep actions explicit/);
  assert.match(prompt, /zero, one, or two suggestions/);
  assert.match(prompt, /open workspace named below/);
  assert.match(prompt, /do not invent work for the Pets Council product/);
});

test('uses deterministic fallback when structured review fails', async () => {
  const provider = new CodexCouncilProvider({ runCouncilReview: async () => { throw new Error('offline'); } });
  const outcome = await provider.review(REAL_TURN);
  assert.equal(outcome.state.phase, 'fallback');
  assert.equal(outcome.review.turnId, REAL_TURN.turnId);
});

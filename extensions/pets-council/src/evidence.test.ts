import assert from 'node:assert/strict';
import test from 'node:test';
import type { CouncilTurn } from './domain';
import { hasUsefulCouncilEvidence, inspectCouncilEvidence } from './evidence';
import { SAMPLE_COUNCIL_TURN } from './sampleTurn';

function liveTurn(overrides: Partial<CouncilTurn> = {}): CouncilTurn {
  return {
    ...SAMPLE_COUNCIL_TURN,
    ...overrides,
    capture: {
      mode: 'live',
      capturedAt: '2026-07-25T13:35:14.000Z',
      warnings: []
    },
    userMessage: 'Review the current workspace context and suggest the next useful step.',
    assistantResponse: 'The live workspace context was captured.',
    workspace: overrides.workspace ?? {},
    git: overrides.git
  };
}

test('ignores placeholder conversation text for live captures', () => {
  const turn = liveTurn();

  assert.equal(hasUsefulCouncilEvidence(turn), false);
  assert.deepEqual(inspectCouncilEvidence(turn), {
    hasConversation: false,
    hasActiveFile: false,
    hasSelection: false,
    hasGitBranch: false,
    hasChangedFiles: false,
    hasDiffSummary: false
  });
});

test('accepts an active file as useful evidence', () => {
  assert.equal(hasUsefulCouncilEvidence(liveTurn({
    workspace: { activeFile: 'src/extension.ts' }
  })), true);
});

test('accepts Git state as useful evidence', () => {
  assert.equal(hasUsefulCouncilEvidence(liveTurn({
    git: {
      branch: 'main',
      changedFiles: []
    }
  })), true);
});

test('accepts real conversation content for sample turns', () => {
  assert.equal(hasUsefulCouncilEvidence(SAMPLE_COUNCIL_TURN), true);
});

import {
  COUNCIL_ROLE_IDS,
  type CouncilReview,
  type CouncilRoleId,
  type CouncilSuggestion,
  type CouncilTurn
} from './domain';

const MAX_SUGGESTIONS_PER_ROLE = 2;

export function reviewMockTurn(turn: CouncilTurn): CouncilReview {
  const suggestionsByRole: Record<CouncilRoleId, readonly CouncilSuggestion[]> = {
    architect: buildArchitectSuggestions(turn),
    guardian: buildGuardianSuggestions(turn),
    strategist: buildStrategistSuggestions(turn),
    notetaker: buildNotetakerSuggestions(turn)
  };

  return {
    turnId: turn.turnId,
    roles: COUNCIL_ROLE_IDS.map((role) => ({
      role,
      suggestions: suggestionsByRole[role].slice(0, MAX_SUGGESTIONS_PER_ROLE)
    }))
  };
}

function buildArchitectSuggestions(turn: CouncilTurn): readonly CouncilSuggestion[] {
  const goal = summarize(turn.userMessage);

  return [
    {
      id: `${turn.turnId}:architect:next-slice`,
      role: 'architect',
      title: 'Build the interactive council loop',
      rationale: `The current goal is clear enough to form one vertical slice: ${goal}`,
      prompt: [
        'Implement the next Pets Council slice.',
        'Use the typed CouncilTurn and CouncilSuggestion contracts.',
        'Render the deterministic review and keep every action user-triggered.'
      ].join(' '),
      actionLabel: 'Prepare implementation prompt'
    }
  ];
}

function buildGuardianSuggestions(turn: CouncilTurn): readonly CouncilSuggestion[] {
  const suggestions: CouncilSuggestion[] = [];
  const changedFiles = turn.git?.changedFiles ?? [];

  if (changedFiles.length > 0) {
    suggestions.push({
      id: `${turn.turnId}:guardian:test-limits`,
      role: 'guardian',
      title: 'Protect the 0–2 suggestion contract',
      rationale: `${changedFiles.length} files are part of the mock slice, so role limits and silent roles need deterministic tests.`,
      prompt: [
        'Add tests for the mock council provider.',
        'Verify that every role is present, no role returns more than two suggestions,',
        'and a role with nothing useful to add returns an empty list without error.'
      ].join(' '),
      actionLabel: 'Prepare test prompt'
    });
  }

  if (turn.workspace.activeFile) {
    suggestions.push({
      id: `${turn.turnId}:guardian:explicit-actions`,
      role: 'guardian',
      title: 'Keep actions explicit',
      rationale: `The panel is connected to ${turn.workspace.activeFile}; suggestion clicks must prepare text without modifying the workspace or running commands.`,
      prompt: [
        'Review the council webview interaction boundary.',
        'Confirm that clicking a suggestion only fills the local composer,',
        'copying requires a second explicit action, and no workspace write or command runs automatically.'
      ].join(' '),
      actionLabel: 'Prepare safety review'
    });
  }

  return suggestions;
}

function buildStrategistSuggestions(turn: CouncilTurn): readonly CouncilSuggestion[] {
  const changedFiles = turn.git?.changedFiles.length ?? 0;

  if (changedFiles <= 3) {
    return [];
  }

  return [
    {
      id: `${turn.turnId}:strategist:split-scope`,
      role: 'strategist',
      title: 'Split the slice before expanding it',
      rationale: `${changedFiles} changed files make the current slice large enough to separate UI behavior from runtime integration.`,
      prompt: [
        'Split the current Pets Council work into two reviewable slices:',
        'first the deterministic UI loop, then the external runtime adapter.',
        'Keep the first slice model-independent.'
      ].join(' '),
      actionLabel: 'Prepare sequencing prompt'
    }
  ];
}

function buildNotetakerSuggestions(turn: CouncilTurn): readonly CouncilSuggestion[] {
  if (!turn.assistantResponse.trim()) {
    return [];
  }

  return [
    {
      id: `${turn.turnId}:notetaker:record-decision`,
      role: 'notetaker',
      title: 'Record the explicit-control decision',
      rationale: 'The response establishes a durable product rule: companions prepare options, but the user decides and triggers the next action.',
      prompt: [
        'Add the following decision to the Pets Council project notes:',
        'council suggestions may prepare prompts or context, but they never execute automatically;',
        'the user must explicitly choose the next action.'
      ].join(' '),
      actionLabel: 'Prepare project note'
    }
  ];
}

function summarize(value: string): string {
  const compact = value.replace(/\s+/g, ' ').trim();
  return compact.length <= 120 ? compact : `${compact.slice(0, 117)}…`;
}

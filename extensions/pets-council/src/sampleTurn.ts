import type { CouncilTurn } from './domain';

export const SAMPLE_COUNCIL_TURN: CouncilTurn = {
  turnId: 'demo-interactive-council-loop',
  userMessage: 'Turn the static panel into a first interactive council loop.',
  assistantResponse: [
    'Add typed council contracts and a deterministic provider.',
    'Allow every role to return zero to two suggestions.',
    'Keep every action explicit and prepare prompts without executing them.'
  ].join(' '),
  capture: {
    mode: 'sample',
    capturedAt: '2026-07-25T00:00:00.000Z',
    warnings: []
  },
  workspace: {
    name: 'Pets-Council',
    activeFile: 'extensions/pets-council/src/extension.ts'
  },
  git: {
    branch: 'feat/interactive-council-loop',
    changedFiles: [
      'extensions/pets-council/src/domain.ts',
      'extensions/pets-council/src/mockCouncil.ts',
      'extensions/pets-council/src/webview.ts'
    ],
    diffSummary: 'Replace the static role catalogue with a deterministic interactive review.'
  }
};

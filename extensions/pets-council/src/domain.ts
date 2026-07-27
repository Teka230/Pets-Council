export const COUNCIL_ROLE_IDS = ['architect', 'guardian', 'strategist', 'notetaker'] as const;
export type CouncilRoleId = (typeof COUNCIL_ROLE_IDS)[number];

export type CouncilRoleDefinition = Readonly<{
  id: CouncilRoleId;
  icon: string;
  name: string;
  purpose: string;
  question: string;
}>;

export const COUNCIL_ROLES: readonly CouncilRoleDefinition[] = [
  {
    id: 'architect',
    icon: '🏗️',
    name: 'Architect',
    purpose: 'Turns the current goal into the next coherent implementation slice.',
    question: 'What should we build next?'
  },
  {
    id: 'guardian',
    icon: '🛡️',
    name: 'Guardian',
    purpose: 'Surfaces risks, defects, assumptions, and missing tests.',
    question: 'What could break or be misunderstood?'
  },
  {
    id: 'strategist',
    icon: '🧭',
    name: 'Strategist',
    purpose: 'Clarifies priorities, sequencing, scope, and trade-offs.',
    question: 'What is the smartest order of operations?'
  },
  {
    id: 'notetaker',
    icon: '📚',
    name: 'Greffier',
    purpose: 'Preserves decisions, provenance, open questions, and project memory.',
    question: 'What must become durable context?'
  }
];

export type CouncilCapture = Readonly<{
  mode: 'live' | 'sample';
  capturedAt: string;
  warnings: readonly string[];
}>;

export type CouncilRuntimeSource = Readonly<{
  source: 'codex';
  threadId: string;
  turnId: string;
  completedAt?: number;
}>;

export type ProjectContextSlice = Readonly<{
  summary: string;
  sources: readonly string[];
  graphNodeCount: number;
  graphEdgeCount: number;
  storagePath?: string;
  truncated?: boolean;
}>;

export type CouncilTurn = Readonly<{
  turnId: string;
  userMessage: string;
  assistantResponse: string;
  capture: CouncilCapture;
  runtime?: CouncilRuntimeSource;
  projectContext?: ProjectContextSlice;
  workspace: Readonly<{
    name?: string;
    activeFile?: string;
    selectedText?: string;
    selectedTextTruncated?: boolean;
  }>;
  git?: Readonly<{
    branch?: string;
    changedFiles: readonly string[];
    changedFilesTruncated?: boolean;
    diffSummary?: string;
    diffSummaryTruncated?: boolean;
  }>;
}>;

export type CouncilSuggestion = Readonly<{
  id: string;
  role: CouncilRoleId;
  title: string;
  rationale: string;
  prompt: string;
  actionLabel: string;
}>;

export type CouncilRoleReview = Readonly<{
  role: CouncilRoleId;
  suggestions: readonly CouncilSuggestion[];
}>;

export type CouncilReview = Readonly<{
  turnId: string;
  roles: readonly CouncilRoleReview[];
}>;

export type CouncilReviewPhase = 'idle' | 'reviewing' | 'ready' | 'fallback' | 'error';
export type CouncilReviewProvider = 'deterministic' | 'codex';

export type CouncilReviewState = Readonly<{
  phase: CouncilReviewPhase;
  provider: CouncilReviewProvider;
  message: string;
  turnId?: string;
}>;

export function emptyCouncilReview(turnId: string): CouncilReview {
  return {
    turnId,
    roles: COUNCIL_ROLE_IDS.map((role) => ({ role, suggestions: [] }))
  };
}

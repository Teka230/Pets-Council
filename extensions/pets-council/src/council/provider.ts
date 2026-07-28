import {
  COUNCIL_ROLE_IDS,
  type CouncilReview,
  type CouncilReviewState,
  type CouncilRoleId,
  type CouncilSuggestion,
  type CouncilTurn,
  emptyCouncilReview
} from '../domain';
import { reviewMockTurn } from '../mockCouncil';

const MAX_SUGGESTIONS_PER_ROLE = 2;
const MAX_FIELD_LENGTH = 2_000;

export type CouncilProviderOutcome = Readonly<{
  review: CouncilReview;
  state: CouncilReviewState;
}>;

export interface CouncilProvider {
  review(turn: CouncilTurn, cwd?: string): Promise<CouncilProviderOutcome>;
}

export interface CouncilReviewGateway {
  runCouncilReview(prompt: string, outputSchema: unknown, cwd?: string): Promise<string>;
}

export class DeterministicCouncilProvider implements CouncilProvider {
  async review(turn: CouncilTurn): Promise<CouncilProviderOutcome> {
    return {
      review: reviewMockTurn(turn),
      state: {
        phase: 'ready',
        provider: 'deterministic',
        message: 'Deterministic Council rules reviewed the current context.',
        turnId: turn.turnId
      }
    };
  }
}

export class CodexCouncilProvider implements CouncilProvider {
  constructor(
    private readonly gateway: CouncilReviewGateway,
    private readonly fallback: CouncilProvider = new DeterministicCouncilProvider()
  ) {}

  async review(turn: CouncilTurn, cwd?: string): Promise<CouncilProviderOutcome> {
    if (turn.runtime?.source !== 'codex') {
      return this.fallback.review(turn, cwd);
    }

    try {
      const raw = await this.gateway.runCouncilReview(
        buildCouncilPrompt(turn),
        COUNCIL_OUTPUT_SCHEMA,
        cwd
      );
      return {
        review: parseCouncilReview(raw, turn.turnId),
        state: {
          phase: 'ready',
          provider: 'codex',
          message: 'Codex completed one structured, read-only Council review using actor-specific projections.',
          turnId: turn.turnId
        }
      };
    } catch (error) {
      const fallback = await this.fallback.review(turn, cwd);
      return {
        review: fallback.review,
        state: {
          phase: 'fallback',
          provider: 'deterministic',
          message: `Structured Council review failed; deterministic fallback used: ${normalizeError(error)}`,
          turnId: turn.turnId
        }
      };
    }
  }
}

export const COUNCIL_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [...COUNCIL_ROLE_IDS],
  properties: Object.fromEntries(COUNCIL_ROLE_IDS.map((role) => [role, {
    type: 'array',
    maxItems: MAX_SUGGESTIONS_PER_ROLE,
    items: {
      type: 'object',
      additionalProperties: false,
      required: ['title', 'rationale', 'prompt'],
      properties: {
        title: { type: 'string', minLength: 1, maxLength: 160 },
        rationale: { type: 'string', minLength: 1, maxLength: 600 },
        prompt: { type: 'string', minLength: 1, maxLength: MAX_FIELD_LENGTH }
      }
    }
  }]))
} as const;

export function buildCouncilPrompt(turn: CouncilTurn): string {
  const project = turn.actorContexts?.codex?.summary?.trim() ?? turn.projectContext?.summary?.trim();
  const selectedText = turn.workspace.selectedText?.trim();
  const changedFiles = turn.git?.changedFiles ?? [];
  const roleProjections = COUNCIL_ROLE_IDS.map((role) => {
    const summary = turn.actorContexts?.[role]?.summary?.trim();
    return `${role.toUpperCase()} PROJECTION\n${summary || 'No actor-specific durable context is available.'}`;
  }).join('\n\n');

  return [
    'Review the completed primary Codex turn as the Pets Council.',
    'Return only the structured object required by the output schema.',
    'Each role may return zero, one, or two suggestions. Silence is correct when a role adds no value.',
    'Suggestions are consultative prompts. Never claim that an action already ran, never approve permissions, and never modify files.',
    'Use each role projection only for that role. Shared facts may appear in more than one projection, but do not collapse the role contracts.',
    'Anchor every suggestion to the open workspace named below. Pets Council is only the review UI; do not invent work for the Pets Council product unless that workspace is itself Pets Council.',
    '',
    'ROLE CONTRACTS',
    '- architect: the next bounded implementation slice.',
    '- guardian: concrete risks, regressions, assumptions, or missing tests.',
    '- strategist: sequencing, scope, and trade-offs only when useful.',
    '- notetaker: durable decisions, open questions, supersession, or provenance that the Greffier should preserve.',
    '',
    `USER MESSAGE\n${turn.userMessage}`,
    '',
    `PRIMARY CODEX RESPONSE\n${turn.assistantResponse}`,
    '',
    `WORKSPACE\nname=${turn.workspace.name ?? 'unknown'}\nactiveFile=${turn.workspace.activeFile ?? 'none'}\nselection=${selectedText || 'none'}`,
    '',
    `GIT\nbranch=${turn.git?.branch ?? 'none'}\nchangedFiles=${changedFiles.length ? changedFiles.join(', ') : 'none'}\ndiffSummary=${turn.git?.diffSummary ?? 'none'}`,
    '',
    `PRIMARY CODEX CONTEXT PROJECTION\n${project || 'No durable project context is available yet.'}`,
    '',
    `ROLE-SPECIFIC PROJECTED CONTEXT\n${roleProjections}`
  ].join('\n');
}

export function parseCouncilReview(raw: string, turnId: string): CouncilReview {
  const parsed = parseJsonObject(raw);
  const roles = COUNCIL_ROLE_IDS.map((role) => ({
    role,
    suggestions: parseRoleSuggestions(parsed[role], role, turnId)
  }));
  return { turnId, roles };
}

function parseRoleSuggestions(value: unknown,role: CouncilRoleId,turnId: string): readonly CouncilSuggestion[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, MAX_SUGGESTIONS_PER_ROLE).map((candidate, index) => parseSuggestion(candidate, role, turnId, index)).filter((suggestion): suggestion is CouncilSuggestion => Boolean(suggestion));
}

function parseSuggestion(value: unknown,role: CouncilRoleId,turnId: string,index: number): CouncilSuggestion | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const candidate = value as Record<string, unknown>;
  const title = boundedString(candidate.title, 160);
  const rationale = boundedString(candidate.rationale, 600);
  const prompt = boundedString(candidate.prompt, MAX_FIELD_LENGTH);
  if (!title || !rationale || !prompt) return undefined;
  return {id: `${turnId}:${role}:codex-${index + 1}`,role,title,rationale,prompt,actionLabel: 'Use in Codex'};
}

function parseJsonObject(raw: string): Record<string, unknown> {
  const trimmed = raw.trim();
  const withoutFence = trimmed.startsWith('```') ? trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '') : trimmed;
  const value = JSON.parse(withoutFence) as unknown;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Council output was not a JSON object.');
  return value as Record<string, unknown>;
}

function boundedString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const compact = value.replace(/\s+/g, ' ').trim();
  if (!compact) return undefined;
  return compact.length <= maxLength ? compact : `${compact.slice(0, maxLength - 1)}…`;
}
function normalizeError(error: unknown): string {return error instanceof Error ? error.message : String(error);}
export function reviewingCouncilState(turnId: string): CouncilReviewState {return {phase:'reviewing',provider:'codex',message:'The four companions are reviewing the completed Codex turn through separate context projections…',turnId};}
export function idleCouncilState(): CouncilReviewState {return {phase:'idle',provider:'deterministic',message:'The Council is waiting for useful project evidence.'};}
export function emptyReviewForState(turnId: string): CouncilReview {return emptyCouncilReview(turnId);}

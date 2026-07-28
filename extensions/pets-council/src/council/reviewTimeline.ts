import {
  COUNCIL_ROLE_IDS,
  type CouncilReview,
  type CouncilReviewPhase,
  type CouncilReviewProvider,
  type CouncilReviewState,
  type CouncilRoleId,
  type CouncilSuggestion,
  type CouncilTurn
} from '../domain';

export const MAX_REVIEWED_TURNS = 50;
export const COUNCIL_REVIEW_TIMELINE_STORAGE_VERSION = 1;

export type CouncilTurnReviewEntry = Readonly<{
  turn: CouncilTurn;
  review: CouncilReview;
  state: CouncilReviewState;
}>;

const PERSISTABLE_PHASES = new Set<CouncilReviewPhase>(['ready', 'fallback', 'error']);

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

export function isPersistableCouncilTurnReview(entry: CouncilTurnReviewEntry): boolean {
  return entry.turn.runtime?.source === 'codex' && PERSISTABLE_PHASES.has(entry.state.phase);
}

export function persistableCouncilTurnReviews(
  entries: readonly CouncilTurnReviewEntry[]
): readonly CouncilTurnReviewEntry[] {
  return entries.filter(isPersistableCouncilTurnReview).slice(-MAX_REVIEWED_TURNS);
}

export function serializeCouncilReviewTimeline(
  entries: readonly CouncilTurnReviewEntry[]
): Readonly<{ version: number; entries: readonly unknown[] }> {
  return {
    version: COUNCIL_REVIEW_TIMELINE_STORAGE_VERSION,
    entries: persistableCouncilTurnReviews(entries).map(serializeEntry)
  };
}

export function hydrateCouncilReviewTimeline(value: unknown): readonly CouncilTurnReviewEntry[] {
  if (typeof value !== 'object' || value === null) return [];
  const root = value as Record<string, unknown>;
  if (root.version !== COUNCIL_REVIEW_TIMELINE_STORAGE_VERSION || !Array.isArray(root.entries)) {
    return [];
  }
  return root.entries
    .map(hydrateEntry)
    .filter((entry): entry is CouncilTurnReviewEntry => entry !== undefined)
    .slice(-MAX_REVIEWED_TURNS);
}

function serializeEntry(entry: CouncilTurnReviewEntry): unknown {
  return {
    turn: {
      turnId: entry.turn.turnId,
      userMessage: entry.turn.userMessage,
      assistantResponse: entry.turn.assistantResponse,
      capture: {
        mode: entry.turn.capture.mode,
        capturedAt: entry.turn.capture.capturedAt,
        warnings: [...entry.turn.capture.warnings]
      },
      runtime: {
        source: 'codex',
        threadId: entry.turn.runtime!.threadId,
        turnId: entry.turn.runtime!.turnId,
        ...(entry.turn.runtime!.completedAt !== undefined ? { completedAt: entry.turn.runtime!.completedAt } : {})
      },
      workspace: {
        ...(entry.turn.workspace.name ? { name: entry.turn.workspace.name } : {}),
        ...(entry.turn.workspace.activeFile ? { activeFile: entry.turn.workspace.activeFile } : {})
      }
    },
    review: {
      turnId: entry.review.turnId,
      roles: entry.review.roles.map((role) => ({
        role: role.role,
        suggestions: role.suggestions.map((suggestion) => ({
          id: suggestion.id,
          role: suggestion.role,
          title: suggestion.title,
          rationale: suggestion.rationale,
          prompt: suggestion.prompt,
          actionLabel: suggestion.actionLabel
        }))
      }))
    },
    state: {
      phase: entry.state.phase,
      provider: entry.state.provider,
      message: entry.state.message,
      ...(entry.state.turnId ? { turnId: entry.state.turnId } : {})
    }
  };
}

function hydrateEntry(value: unknown): CouncilTurnReviewEntry | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const record = value as Record<string, unknown>;
  const turn = hydrateTurn(record.turn);
  const review = hydrateReview(record.review);
  const state = hydrateState(record.state);
  if (!turn || !review || !state) return undefined;
  if (turn.turnId !== review.turnId) return undefined;
  if (!isPersistableCouncilTurnReview({ turn, review, state })) return undefined;
  return { turn, review, state };
}

function hydrateTurn(value: unknown): CouncilTurn | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const record = value as Record<string, unknown>;
  const turnId = text(record.turnId);
  const userMessage = text(record.userMessage);
  const assistantResponse = text(record.assistantResponse);
  const capture = hydrateCapture(record.capture);
  const runtime = hydrateRuntime(record.runtime);
  const workspace = hydrateWorkspace(record.workspace);
  if (!turnId || userMessage === undefined || assistantResponse === undefined || !capture || !runtime || !workspace) {
    return undefined;
  }
  return { turnId, userMessage, assistantResponse, capture, runtime, workspace };
}

function hydrateCapture(value: unknown): CouncilTurn['capture'] | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const record = value as Record<string, unknown>;
  const mode = record.mode === 'live' || record.mode === 'sample' ? record.mode : undefined;
  const capturedAt = text(record.capturedAt);
  if (!mode || !capturedAt) return undefined;
  const warnings = Array.isArray(record.warnings)
    ? record.warnings.filter((item): item is string => typeof item === 'string')
    : [];
  return { mode, capturedAt, warnings };
}

function hydrateRuntime(value: unknown): CouncilTurn['runtime'] | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const record = value as Record<string, unknown>;
  if (record.source !== 'codex') return undefined;
  const threadId = text(record.threadId);
  const turnId = text(record.turnId);
  if (!threadId || !turnId) return undefined;
  const completedAt = typeof record.completedAt === 'number' && Number.isFinite(record.completedAt)
    ? record.completedAt
    : undefined;
  return { source: 'codex', threadId, turnId, ...(completedAt !== undefined ? { completedAt } : {}) };
}

function hydrateWorkspace(value: unknown): CouncilTurn['workspace'] | undefined {
  if (typeof value !== 'object' || value === null) return { };
  const record = value as Record<string, unknown>;
  return {
    ...(text(record.name) ? { name: text(record.name) } : {}),
    ...(text(record.activeFile) ? { activeFile: text(record.activeFile) } : {})
  };
}

function hydrateReview(value: unknown): CouncilReview | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const record = value as Record<string, unknown>;
  const turnId = text(record.turnId);
  if (!turnId || !Array.isArray(record.roles)) return undefined;
  const rolesById = new Map<CouncilRoleId, CouncilSuggestion[]>();
  for (const roleId of COUNCIL_ROLE_IDS) rolesById.set(roleId, []);
  for (const rawRole of record.roles) {
    if (typeof rawRole !== 'object' || rawRole === null) continue;
    const roleRecord = rawRole as Record<string, unknown>;
    const role = asRole(roleRecord.role);
    if (!role || !Array.isArray(roleRecord.suggestions)) continue;
    const suggestions = roleRecord.suggestions
      .map((item) => hydrateSuggestion(item, role))
      .filter((item): item is CouncilSuggestion => item !== undefined);
    rolesById.set(role, suggestions);
  }
  return {
    turnId,
    roles: COUNCIL_ROLE_IDS.map((role) => ({ role, suggestions: rolesById.get(role) ?? [] }))
  };
}

function hydrateSuggestion(value: unknown, fallbackRole: CouncilRoleId): CouncilSuggestion | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const record = value as Record<string, unknown>;
  const id = text(record.id);
  const role = asRole(record.role) ?? fallbackRole;
  const title = text(record.title);
  const rationale = text(record.rationale);
  const prompt = text(record.prompt);
  const actionLabel = text(record.actionLabel);
  if (!id || !title || rationale === undefined || prompt === undefined || !actionLabel) return undefined;
  return { id, role, title, rationale, prompt, actionLabel };
}

function hydrateState(value: unknown): CouncilReviewState | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const record = value as Record<string, unknown>;
  const phase = asPhase(record.phase);
  const provider = asProvider(record.provider);
  const message = text(record.message);
  if (!phase || !provider || message === undefined) return undefined;
  if (!PERSISTABLE_PHASES.has(phase)) return undefined;
  return {
    phase,
    provider,
    message,
    ...(text(record.turnId) ? { turnId: text(record.turnId) } : {})
  };
}

function asRole(value: unknown): CouncilRoleId | undefined {
  return typeof value === 'string' && (COUNCIL_ROLE_IDS as readonly string[]).includes(value)
    ? value as CouncilRoleId
    : undefined;
}

function asPhase(value: unknown): CouncilReviewPhase | undefined {
  return value === 'idle' || value === 'reviewing' || value === 'ready' || value === 'fallback' || value === 'error'
    ? value
    : undefined;
}

function asProvider(value: unknown): CouncilReviewProvider | undefined {
  return value === 'deterministic' || value === 'codex' ? value : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

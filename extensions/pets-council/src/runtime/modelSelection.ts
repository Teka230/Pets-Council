/** Product defaults aligned with Codex (`~/.codex/config.toml`). */
export const DEFAULT_CODEX_MODEL = 'gpt-5.5';
export const DEFAULT_CODEX_EFFORT = 'medium';

export type CodexModelDescriptor = Readonly<{
  id: string;
  model: string;
  displayName: string;
  modelProvider?: string;
  isDefault: boolean;
  supportedReasoningEfforts: readonly string[];
  defaultReasoningEffort?: string;
}>;

export type CodexModelSelection = Readonly<{
  model: string;
  modelProvider?: string;
  effort?: string;
}>;

export type CodexTokenUsageBreakdown = Readonly<{
  totalTokens: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
}>;

export type CodexTokenUsage = Readonly<{
  last?: CodexTokenUsageBreakdown;
  total?: CodexTokenUsageBreakdown;
  modelContextWindow?: number;
  quotaUsedPercent?: number;
  quotaWindowMinutes?: number;
}>;

export function normalizeModelList(value: unknown, fallbackProvider?: string): CodexModelDescriptor[] {
  const record = asRecord(value);
  const list = asArray(record.data ?? record.models ?? value);
  const seen = new Set<string>();

  return list.flatMap((entry) => {
    const item = asRecord(entry);
    const model = text(item.model ?? item.id);
    if (!model || seen.has(model)) {
      return [];
    }
    seen.add(model);

    const efforts = asArray(item.supportedReasoningEfforts ?? item.reasoningEfforts ?? item.reasoning_efforts)
      .map((effort) => text(typeof effort === 'string' ? effort : asRecord(effort).reasoningEffort ?? asRecord(effort).id))
      .filter(Boolean);

    return [{
      id: text(item.id, model),
      model,
      displayName: text(item.displayName ?? item.display_name, model),
      modelProvider: text(item.modelProvider ?? item.model_provider ?? item.provider) || fallbackProvider,
      isDefault: item.isDefault === true || item.default === true,
      supportedReasoningEfforts: efforts,
      defaultReasoningEffort: text(item.defaultReasoningEffort ?? item.default_reasoning_effort) || efforts[0]
    }];
  });
}

export function readConfigSelection(value: unknown): Partial<CodexModelSelection> {
  const config = asRecord(value);
  const model = text(config.model);
  const modelProvider = text(config.model_provider ?? config.modelProvider);
  const effort = text(config.model_reasoning_effort ?? config.modelReasoningEffort);
  return {
    ...(model ? { model } : {}),
    ...(modelProvider ? { modelProvider } : {}),
    ...(effort ? { effort } : {})
  };
}

export function resolveModelSelection(
  models: readonly CodexModelDescriptor[],
  preferred: Partial<CodexModelSelection> | undefined
): CodexModelSelection | undefined {
  const preferredModel = preferred?.model || DEFAULT_CODEX_MODEL;
  const preferredEffort = preferred?.effort || DEFAULT_CODEX_EFFORT;

  if (!models.length) {
    return coerceSelection(
      { model: preferredModel, modelProvider: preferred?.modelProvider, effort: preferredEffort },
      undefined
    );
  }

  const descriptor =
    findDescriptor(models, preferred?.model) ??
    findDescriptor(models, DEFAULT_CODEX_MODEL) ??
    models.find((candidate) => candidate.isDefault) ??
    models[0];

  const effort = resolveEffort(descriptor, preferredEffort);
  const modelProvider = descriptor.modelProvider ?? preferred?.modelProvider;
  return {
    model: descriptor.model,
    ...(modelProvider ? { modelProvider } : {}),
    ...(effort ? { effort } : {})
  };
}

export function resolveEffort(descriptor: CodexModelDescriptor | undefined, preferred?: string): string | undefined {
  const fallback = preferred || DEFAULT_CODEX_EFFORT;
  if (!descriptor?.supportedReasoningEfforts.length) {
    return fallback;
  }
  if (preferred && descriptor.supportedReasoningEfforts.includes(preferred)) {
    return preferred;
  }
  if (descriptor.supportedReasoningEfforts.includes(DEFAULT_CODEX_EFFORT)) {
    return DEFAULT_CODEX_EFFORT;
  }
  if (descriptor.defaultReasoningEffort && descriptor.supportedReasoningEfforts.includes(descriptor.defaultReasoningEffort)) {
    return descriptor.defaultReasoningEffort;
  }
  return descriptor.supportedReasoningEfforts[0];
}

export function buildThreadModelParams(selection: CodexModelSelection | undefined): Record<string, unknown> {
  if (!selection?.model) {
    return {};
  }
  return {
    model: selection.model,
    ...(selection.modelProvider ? { modelProvider: selection.modelProvider } : {})
  };
}

export function buildTurnEffortParams(selection: CodexModelSelection | undefined): Record<string, unknown> {
  if (!selection?.effort) {
    return {};
  }
  return { effort: selection.effort };
}

export function parseTokenUsageNotification(params: unknown): CodexTokenUsage | undefined {
  const root = asRecord(params);
  const usage = asRecord(root.tokenUsage ?? root.usage ?? root);
  const last = parseBreakdown(usage.last ?? usage);
  const total = parseBreakdown(usage.total);
  const modelContextWindow = numberValue(usage.modelContextWindow ?? usage.model_context_window);
  const quotaUsedPercent = numberValue(usage.usedPercent ?? usage.used_percent);
  const quotaWindowMinutes = numberValue(usage.windowDurationMins ?? usage.window_duration_mins);

  if (!last && !total && modelContextWindow === undefined && quotaUsedPercent === undefined) {
    return undefined;
  }

  return {
    ...(last ? { last } : {}),
    ...(total ? { total } : {}),
    ...(modelContextWindow !== undefined ? { modelContextWindow } : {}),
    ...(quotaUsedPercent !== undefined ? { quotaUsedPercent } : {}),
    ...(quotaWindowMinutes !== undefined ? { quotaWindowMinutes } : {})
  };
}

export function formatTokenUsage(usage: CodexTokenUsage | undefined): string | undefined {
  if (!usage) {
    return undefined;
  }

  const parts: string[] = [];
  const breakdown = usage.last ?? usage.total;
  if (breakdown) {
    parts.push(`${formatCount(breakdown.totalTokens)} tokens`);
    parts.push(`${formatCount(breakdown.inputTokens)} in`);
    parts.push(`${formatCount(breakdown.outputTokens)} out`);
    if (breakdown.reasoningOutputTokens > 0) {
      parts.push(`${formatCount(breakdown.reasoningOutputTokens)} reasoning`);
    }
    if (breakdown.cachedInputTokens > 0) {
      parts.push(`${formatCount(breakdown.cachedInputTokens)} cached`);
    }
  }
  if (usage.modelContextWindow) {
    parts.push(`context ${formatCount(usage.modelContextWindow)}`);
  }
  if (usage.quotaUsedPercent !== undefined) {
    const window = usage.quotaWindowMinutes ? ` (${usage.quotaWindowMinutes} min)` : '';
    parts.push(`quota ${usage.quotaUsedPercent}%${window}`);
  }
  return parts.length ? parts.join(' · ') : undefined;
}

function parseBreakdown(value: unknown): CodexTokenUsageBreakdown | undefined {
  const record = asRecord(value);
  const totalTokens = numberValue(record.totalTokens ?? record.total_tokens);
  if (totalTokens === undefined) {
    return undefined;
  }
  return {
    totalTokens,
    inputTokens: numberValue(record.inputTokens ?? record.input_tokens) ?? 0,
    cachedInputTokens: numberValue(record.cachedInputTokens ?? record.cached_input_tokens) ?? 0,
    outputTokens: numberValue(record.outputTokens ?? record.output_tokens) ?? 0,
    reasoningOutputTokens: numberValue(record.reasoningOutputTokens ?? record.reasoning_output_tokens) ?? 0
  };
}

function findDescriptor(models: readonly CodexModelDescriptor[], model?: string): CodexModelDescriptor | undefined {
  if (!model) {
    return undefined;
  }
  return models.find((candidate) => candidate.model === model || candidate.id === model);
}

function coerceSelection(
  preferred: Partial<CodexModelSelection>,
  descriptor: CodexModelDescriptor | undefined
): CodexModelSelection {
  const modelProvider = preferred.modelProvider ?? descriptor?.modelProvider;
  const effort = resolveEffort(descriptor, preferred.effort);
  return {
    model: preferred.model!,
    ...(modelProvider ? { modelProvider } : {}),
    ...(effort ? { effort } : {})
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function formatCount(value: number): string {
  return new Intl.NumberFormat(undefined, { notation: value >= 10_000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(value);
}

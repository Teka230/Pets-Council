export type CodexThreadSummary = Readonly<{
  id: string;
  preview?: string;
  cwd?: string;
  model?: string;
  modelProvider?: string;
  createdAt?: number;
  updatedAt?: number;
  recencyAt?: number;
  status?: string;
}>;

export type CodexThreadListPage = Readonly<{
  data: readonly CodexThreadSummary[];
  nextCursor?: string;
}>;

export type SessionBrowserState = Readonly<{
  phase: 'idle' | 'loading' | 'ready' | 'error';
  message: string;
  threads: readonly CodexThreadSummary[];
  aliases: Readonly<Record<string, string>>;
}>;

export function parseThreadList(value: unknown): CodexThreadListPage {
  const root = record(value);
  const rows = Array.isArray(root.data) ? root.data : [];
  return {
    data: rows.flatMap((raw) => {
      const thread = record(raw);
      const id = text(thread.id);
      if (!id) return [];
      return [{
        id,
        preview: text(thread.preview),
        cwd: text(thread.cwd),
        model: text(thread.model),
        modelProvider: text(thread.modelProvider ?? thread.model_provider),
        createdAt: numberValue(thread.createdAt ?? thread.created_at),
        updatedAt: numberValue(thread.updatedAt ?? thread.updated_at),
        recencyAt: numberValue(thread.recencyAt ?? thread.recency_at),
        status: statusText(thread.status)
      }];
    }),
    nextCursor: text(root.nextCursor ?? root.next_cursor)
  };
}

export function sessionDisplayName(thread: CodexThreadSummary, aliases: Readonly<Record<string, string>>): string {
  const alias = aliases[thread.id]?.trim();
  if (alias) return alias;
  const preview = thread.preview?.trim();
  return preview || `Session ${shortId(thread.id)}`;
}

function record(value: unknown): Record<string, unknown> { return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}; }
function text(value: unknown): string | undefined { return typeof value === 'string' && value.trim() ? value.trim() : undefined; }
function numberValue(value: unknown): number | undefined { return typeof value === 'number' && Number.isFinite(value) ? value : undefined; }
function statusText(value: unknown): string | undefined { const item = record(value); return text(item.type) ?? text(value); }
function shortId(value: string): string { return value.length <= 12 ? value : `${value.slice(0, 8)}…${value.slice(-4)}`; }

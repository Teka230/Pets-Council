import { CodexAppServerClient } from './client';
import { parseThreadList, type CodexThreadSummary } from './sessionCatalog';
import type { CodexTransportFactory } from './types';

const SESSION_REQUEST_TIMEOUT_MS = 15_000;

export class CodexSessionBrowserService {
  constructor(private readonly binary: () => string, private readonly factory: CodexTransportFactory) {}

  async list(cwd?: string): Promise<readonly CodexThreadSummary[]> {
    const client = await CodexAppServerClient.connect(this.factory, this.binary());
    try {
      const result: CodexThreadSummary[] = [];
      let cursor: string | null = null;
      for (let page = 0; page < 5; page++) {
        const response = await client.request<unknown>('thread/list', {
          cursor,
          limit: 50,
          sortKey: 'recency_at',
          sortDirection: 'desc',
          modelProviders: null,
          sourceKinds: [],
          archived: false,
          ...(cwd ? { cwd } : {})
        }, SESSION_REQUEST_TIMEOUT_MS);
        const parsed = parseThreadList(response);
        result.push(...parsed.data);
        if (!parsed.nextCursor || parsed.nextCursor === cursor) break;
        cursor = parsed.nextCursor;
      }
      return dedupe(result);
    } finally {
      client.dispose();
    }
  }

  async archive(threadId: string): Promise<void> {
    const client = await CodexAppServerClient.connect(this.factory, this.binary());
    try {
      await client.request('thread/archive', { threadId }, SESSION_REQUEST_TIMEOUT_MS);
    } finally {
      client.dispose();
    }
  }
}

function dedupe(threads: readonly CodexThreadSummary[]): CodexThreadSummary[] {
  const seen = new Set<string>();
  return threads.filter((thread) => {
    if (seen.has(thread.id)) return false;
    seen.add(thread.id);
    return true;
  });
}

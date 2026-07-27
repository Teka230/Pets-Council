import type { CodexResumeCandidate } from './types';

export interface SessionMemento {
  get<T>(key: string): T | undefined;
  update(key: string, value: unknown): Thenable<void>;
}

export class CodexSessionStore {
  constructor(private readonly memento: SessionMemento) {}

  load(workspaceKey: string): CodexResumeCandidate | undefined {
    const value = this.memento.get<unknown>(storageKey(workspaceKey));
    if (typeof value !== 'object' || value === null) {
      return undefined;
    }
    const candidate = value as Record<string, unknown>;
    return typeof candidate.threadId === 'string'
      && candidate.threadId.trim()
      && typeof candidate.savedAt === 'number'
      && Number.isFinite(candidate.savedAt)
      ? { threadId: candidate.threadId, savedAt: candidate.savedAt }
      : undefined;
  }

  async save(workspaceKey: string, threadId: string): Promise<CodexResumeCandidate> {
    const candidate = { threadId, savedAt: Date.now() };
    await this.memento.update(storageKey(workspaceKey), candidate);
    return candidate;
  }

  async clear(workspaceKey: string): Promise<void> {
    await this.memento.update(storageKey(workspaceKey), undefined);
  }
}

export function createWorkspaceSessionKey(workspaceUris: readonly string[]): string {
  return workspaceUris.length > 0
    ? workspaceUris.slice().sort().join('|')
    : 'no-workspace';
}

function storageKey(workspaceKey: string): string {
  return `codexSession:${workspaceKey}`;
}

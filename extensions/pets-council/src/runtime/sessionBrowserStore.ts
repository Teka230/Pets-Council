import type { SessionMemento } from './sessionStore';

export class CodexSessionBrowserStore {
  constructor(private readonly memento: SessionMemento) {}

  loadAliases(workspaceKey: string): Readonly<Record<string, string>> {
    const value = this.memento.get<unknown>(storageKey(workspaceKey));
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
    const aliases: Record<string, string> = {};
    for (const [threadId, raw] of Object.entries(value as Record<string, unknown>)) {
      if (threadId.trim() && typeof raw === 'string' && raw.trim()) aliases[threadId] = raw.trim().slice(0, 80);
    }
    return aliases;
  }

  async rename(workspaceKey: string, threadId: string, name: string): Promise<Readonly<Record<string, string>>> {
    const aliases = { ...this.loadAliases(workspaceKey) };
    const normalized = name.trim().slice(0, 80);
    if (normalized) aliases[threadId] = normalized;
    else delete aliases[threadId];
    await this.memento.update(storageKey(workspaceKey), aliases);
    return aliases;
  }

  async forget(workspaceKey: string, threadId: string): Promise<Readonly<Record<string, string>>> {
    return this.rename(workspaceKey, threadId, '');
  }
}

function storageKey(workspaceKey: string): string { return `codexSessionAliases:${workspaceKey}`; }

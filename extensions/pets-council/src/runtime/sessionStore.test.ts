import assert from 'node:assert/strict';
import test from 'node:test';
import { CodexSessionStore, createWorkspaceSessionKey, type SessionMemento } from './sessionStore';

class MemoryMemento implements SessionMemento {
  readonly values = new Map<string, unknown>();

  get<T>(key: string): T | undefined {
    return this.values.get(key) as T | undefined;
  }

  update(key: string, value: unknown): Thenable<void> {
    if (value === undefined) {
      this.values.delete(key);
    } else {
      this.values.set(key, value);
    }
    return Promise.resolve();
  }
}

test('creates a deterministic key for multi-root workspaces', () => {
  assert.equal(
    createWorkspaceSessionKey(['file:///zeta', 'file:///alpha']),
    'file:///alpha|file:///zeta'
  );
  assert.equal(createWorkspaceSessionKey([]), 'no-workspace');
});

test('saves and loads only the thread identifier and timestamp', async () => {
  const memento = new MemoryMemento();
  const store = new CodexSessionStore(memento);

  const saved = await store.save('workspace-a', 'thread-1');
  const loaded = store.load('workspace-a');

  assert.equal(saved.threadId, 'thread-1');
  assert.deepEqual(loaded, saved);
  assert.deepEqual(Object.keys(loaded ?? {}).sort(), ['savedAt', 'threadId']);
});

test('ignores malformed persisted values and supports clearing', async () => {
  const memento = new MemoryMemento();
  memento.values.set('codexSession:workspace-a', { threadId: '', savedAt: 'yesterday' });
  const store = new CodexSessionStore(memento);

  assert.equal(store.load('workspace-a'), undefined);
  await store.save('workspace-a', 'thread-2');
  await store.clear('workspace-a');
  assert.equal(store.load('workspace-a'), undefined);
});

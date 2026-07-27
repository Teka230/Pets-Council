import assert from 'node:assert/strict';
import test from 'node:test';
import { CodexAppServerClient } from './client';
import type { CodexMessageTransport, RuntimeDisposable } from './types';

class FakeTransport implements CodexMessageTransport {
  readonly sent: unknown[] = [];
  private readonly messages = new Set<(message: unknown) => void>();
  private readonly closes = new Set<(reason: string) => void>();
  disposed = false;

  send(message: unknown): void {
    this.sent.push(message);
    const request = message as { id?: number; method?: string };
    if (request.method === 'initialize') this.reply({ id: request.id, result: { userAgent: 'codex-test/1.0' } });
    if (request.method === 'thread/start') this.reply({ id: request.id, result: { thread: { id: 'thread-1', sessionId: 'session-1', modelProvider: 'openai', cwd: '/workspace' }, model: 'gpt-test', modelProvider: 'openai', cwd: '/workspace', approvalsReviewer: 'user' } });
    if (request.method === 'turn/start') this.reply({ id: request.id, result: { turn: { id: 'turn-1', items: [], status: 'inProgress', error: null } } });
  }
  onMessage(listener: (message: unknown) => void): RuntimeDisposable { this.messages.add(listener); return { dispose: () => this.messages.delete(listener) }; }
  onClose(listener: (reason: string) => void): RuntimeDisposable { this.closes.add(listener); return { dispose: () => this.closes.delete(listener) }; }
  dispose(): void { this.disposed = true; this.messages.clear(); this.closes.clear(); }
  emit(message: unknown): void { for (const listener of this.messages) listener(message); }
  private reply(message: unknown): void { queueMicrotask(() => this.emit(message)); }
}

test('performs initialize followed by initialized', async () => {
  const transport = new FakeTransport();
  const client = await CodexAppServerClient.connect(async () => transport, 'codex', 100);
  assert.deepEqual(transport.sent.slice(0, 2), [
    { id: 1, method: 'initialize', params: { clientInfo: { name: 'pets_council', title: 'Pets Council', version: '0.6.0' }, capabilities: {} } },
    { method: 'initialized' }
  ]);
  client.dispose();
  assert.equal(transport.disposed, true);
});

test('starts a thread with explicit user approval routing', async () => {
  const transport = new FakeTransport();
  const client = await CodexAppServerClient.connect(async () => transport, 'codex', 100);
  const thread = await client.startThread('/workspace');
  assert.equal(thread.id, 'thread-1');
  assert.deepEqual(transport.sent[2], { id: 1, method: 'thread/start', params: { cwd: '/workspace', approvalsReviewer: 'user' } });
  client.dispose();
});

test('starts a text turn without implicit extra input', async () => {
  const transport = new FakeTransport();
  const client = await CodexAppServerClient.connect(async () => transport, 'codex', 100);
  const turnId = await client.startTurn('thread-1', 'Explain this change', '/workspace');
  assert.equal(turnId, 'turn-1');
  assert.deepEqual(transport.sent[2], {
    id: 1,
    method: 'turn/start',
    params: {
      threadId: 'thread-1',
      input: [{ type: 'text', text: 'Explain this change' }],
      cwd: '/workspace',
      approvalsReviewer: 'user'
    }
  });
  client.dispose();
});

test('routes notifications after initialization', async () => {
  const transport = new FakeTransport();
  const client = await CodexAppServerClient.connect(async () => transport, 'codex', 100);
  const notifications: unknown[] = [];
  client.onNotification((notification) => notifications.push(notification));
  transport.emit({ method: 'turn/started', params: { threadId: 'thread-1' } });
  assert.equal(notifications.length, 1);
  client.dispose();
});

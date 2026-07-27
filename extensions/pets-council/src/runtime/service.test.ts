import assert from 'node:assert/strict';
import test from 'node:test';
import { CodexRuntimeService, resolveCodexBinary } from './service';
import type { CodexMessageTransport, RuntimeDisposable } from './types';

class StreamingTransport implements CodexMessageTransport {
  readonly sent: unknown[] = [];
  private readonly messages = new Set<(message: unknown) => void>();
  private readonly closes = new Set<(reason: string) => void>();
  disposed = false;

  send(message: unknown): void {
    this.sent.push(message);
    const request = message as { id?: number; method?: string };
    if (request.method === 'initialize') this.reply({ id: request.id, result: { userAgent: 'codex-test/1.0' } });
    if (request.method === 'thread/start') this.reply({ id: request.id, result: { thread: { id: 'thread-1', sessionId: 'session-1', modelProvider: 'openai', cwd: '/workspace' }, model: 'gpt-test', modelProvider: 'openai', cwd: '/workspace', approvalsReviewer: 'user' } });
    if (request.method === 'turn/start') {
      this.reply({ id: request.id, result: { turn: { id: 'turn-1', items: [], status: 'inProgress', error: null } } });
      queueMicrotask(() => {
        this.emit({ method: 'turn/started', params: { threadId: 'thread-1', turn: { id: 'turn-1', startedAt: 100 } } });
        this.emit({ method: 'item/agentMessage/delta', params: { threadId: 'thread-1', turnId: 'turn-1', itemId: 'item-1', delta: 'Hello ' } });
        this.emit({ method: 'item/agentMessage/delta', params: { threadId: 'thread-1', turnId: 'turn-1', itemId: 'item-1', delta: 'world' } });
        this.emit({ method: 'item/completed', params: { threadId: 'thread-1', turnId: 'turn-1', item: { type: 'agentMessage', id: 'item-1', text: 'Hello world' } } });
        this.emit({ method: 'turn/completed', params: { threadId: 'thread-1', turn: { id: 'turn-1', status: 'completed', error: null, completedAt: 101 } } });
      });
    }
  }
  onMessage(listener: (message: unknown) => void): RuntimeDisposable { this.messages.add(listener); return { dispose: () => this.messages.delete(listener) }; }
  onClose(listener: (reason: string) => void): RuntimeDisposable { this.closes.add(listener); return { dispose: () => this.closes.delete(listener) }; }
  dispose(): void { this.disposed = true; this.messages.clear(); this.closes.clear(); }
  emit(message: unknown): void { for (const listener of this.messages) listener(message); }
  emitClose(reason: string): void { for (const listener of this.closes) listener(reason); }
  private reply(message: unknown): void { queueMicrotask(() => this.emit(message)); }
}

async function readyService(): Promise<{ service: CodexRuntimeService; transport: StreamingTransport }> {
  const transport = new StreamingTransport();
  const service = new CodexRuntimeService('codex', async () => transport);
  await service.connect();
  await service.startThread('/workspace');
  return { service, transport };
}

test('resolves configured binary before CODEX_BIN', () => {
  assert.equal(resolveCodexBinary('/custom/codex', { CODEX_BIN: '/env/codex' }), '/custom/codex');
});

test('creates a ready thread with an idle turn', async () => {
  const { service } = await readyService();
  assert.equal(service.status.phase, 'ready');
  assert.equal(service.status.thread.phase, 'ready');
  assert.equal(service.status.turn.phase, 'idle');
  service.dispose();
});

test('streams and completes one assistant message', async () => {
  const { service } = await readyService();
  await service.startTurn('Say hello', '/workspace');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(service.status.turn.phase, 'completed');
  assert.equal(service.status.turn.turnId, 'turn-1');
  assert.equal(service.status.turn.userMessage, 'Say hello');
  assert.equal(service.status.turn.assistantMessage, 'Hello world');
  assert.equal(service.status.turn.startedAt, 100);
  assert.equal(service.status.turn.completedAt, 101);
  service.dispose();
});

test('ignores notifications from another thread', async () => {
  const { service, transport } = await readyService();
  transport.emit({ method: 'item/agentMessage/delta', params: { threadId: 'other-thread', turnId: 'other-turn', delta: 'wrong' } });
  assert.equal(service.status.turn.assistantMessage, undefined);
  service.dispose();
});

test('requires a connected session and non-empty prompt', async () => {
  const service = new CodexRuntimeService('codex', async () => new StreamingTransport());
  await service.startTurn('hello');
  assert.equal(service.status.turn.phase, 'error');
  await service.connect();
  await service.startThread('/workspace');
  await service.startTurn('   ');
  assert.match(service.status.turn.message, /Write a prompt/);
  service.dispose();
});

test('disconnect clears thread and turn state', async () => {
  const { service, transport } = await readyService();
  service.disconnect();
  assert.equal(service.status.phase, 'disconnected');
  assert.equal(service.status.thread.phase, 'none');
  assert.equal(service.status.turn.phase, 'idle');
  assert.equal(transport.disposed, true);
});

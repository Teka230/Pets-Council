import assert from 'node:assert/strict';
import test from 'node:test';
import { CodexRuntimeService, resolveCodexBinary } from './service';
import type {
  CodexMessageTransport,
  RuntimeDisposable
} from './types';

class HandshakeTransport implements CodexMessageTransport {
  private readonly messageListeners = new Set<(message: unknown) => void>();
  private readonly closeListeners = new Set<(reason: string) => void>();
  disposed = false;

  send(message: unknown): void {
    const candidate = message as { id?: number; method?: string };
    if (candidate.method === 'initialize') {
      queueMicrotask(() => this.emitMessage({
        id: candidate.id,
        result: {
          userAgent: 'codex-test/1.0',
          platformFamily: 'unix',
          platformOs: 'linux'
        }
      }));
    }
  }

  onMessage(listener: (message: unknown) => void): RuntimeDisposable {
    this.messageListeners.add(listener);
    return { dispose: () => this.messageListeners.delete(listener) };
  }

  onClose(listener: (reason: string) => void): RuntimeDisposable {
    this.closeListeners.add(listener);
    return { dispose: () => this.closeListeners.delete(listener) };
  }

  dispose(): void {
    this.disposed = true;
    this.messageListeners.clear();
    this.closeListeners.clear();
  }

  emitClose(reason: string): void {
    for (const listener of this.closeListeners) {
      listener(reason);
    }
  }

  private emitMessage(message: unknown): void {
    for (const listener of this.messageListeners) {
      listener(message);
    }
  }
}

test('resolves configured binary before CODEX_BIN', () => {
  assert.equal(
    resolveCodexBinary('/custom/codex', { CODEX_BIN: '/env/codex' }),
    '/custom/codex'
  );
});

test('falls back from CODEX_BIN to codex', () => {
  assert.equal(resolveCodexBinary(undefined, { CODEX_BIN: '/env/codex' }), '/env/codex');
  assert.equal(resolveCodexBinary(undefined, {}), 'codex');
});

test('becomes ready only after the initialize handshake', async () => {
  const transport = new HandshakeTransport();
  const service = new CodexRuntimeService('codex', async () => transport);
  const phases: string[] = [];
  service.onDidChange((status) => phases.push(status.phase));

  await service.connect();

  assert.deepEqual(phases, ['connecting', 'ready']);
  assert.equal(service.status.phase, 'ready');
  assert.equal(service.status.server?.userAgent, 'codex-test/1.0');

  service.dispose();
});

test('keeps process launch failures visible and retryable', async () => {
  const service = new CodexRuntimeService('missing-codex', async () => {
    throw new Error('binary not found');
  });

  await service.connect();

  assert.equal(service.status.phase, 'error');
  assert.match(service.status.message, /binary not found/);
});

test('moves to error when a ready runtime exits unexpectedly', async () => {
  const transport = new HandshakeTransport();
  const service = new CodexRuntimeService('codex', async () => transport);
  await service.connect();

  transport.emitClose('process exited unexpectedly');

  assert.equal(service.status.phase, 'error');
  assert.match(service.status.message, /unexpectedly/);
});

test('disconnects explicitly and disposes the process transport', async () => {
  const transport = new HandshakeTransport();
  const service = new CodexRuntimeService('codex', async () => transport);
  await service.connect();

  service.disconnect();

  assert.equal(service.status.phase, 'disconnected');
  assert.equal(transport.disposed, true);
});

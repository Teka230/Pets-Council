import assert from 'node:assert/strict';
import test from 'node:test';
import { CodexAppServerClient } from './client';
import type {
  CodexMessageTransport,
  RuntimeDisposable
} from './types';

class FakeTransport implements CodexMessageTransport {
  readonly sent: unknown[] = [];
  private readonly messageListeners = new Set<(message: unknown) => void>();
  private readonly closeListeners = new Set<(reason: string) => void>();
  disposed = false;

  constructor(
    private readonly initializeReply: unknown = {
      id: 1,
      result: {
        userAgent: 'codex-test/1.0',
        codexHome: '/tmp/codex',
        platformFamily: 'unix',
        platformOs: 'linux'
      }
    }
  ) {}

  send(message: unknown): void {
    this.sent.push(message);
    const candidate = message as { method?: string };
    if (candidate.method === 'initialize') {
      queueMicrotask(() => this.emitMessage(this.initializeReply));
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

  emitMessage(message: unknown): void {
    for (const listener of this.messageListeners) {
      listener(message);
    }
  }

  emitClose(reason: string): void {
    for (const listener of this.closeListeners) {
      listener(reason);
    }
  }
}

test('performs initialize followed by initialized', async () => {
  const transport = new FakeTransport();
  const client = await CodexAppServerClient.connect(
    async () => transport,
    'codex',
    100
  );

  assert.deepEqual(transport.sent, [
    {
      id: 1,
      method: 'initialize',
      params: {
        clientInfo: {
          name: 'pets_council',
          title: 'Pets Council',
          version: '0.4.0'
        },
        capabilities: {}
      }
    },
    { method: 'initialized' }
  ]);
  assert.equal(client.serverInfo.userAgent, 'codex-test/1.0');
  assert.equal(client.serverInfo.platformOs, 'linux');

  client.dispose();
  assert.equal(transport.disposed, true);
});

test('surfaces initialize protocol errors', async () => {
  const transport = new FakeTransport({
    id: 1,
    error: {
      code: -32000,
      message: 'Not authenticated'
    }
  });

  await assert.rejects(
    CodexAppServerClient.connect(async () => transport, 'codex', 100),
    /Not authenticated/
  );
  assert.equal(transport.disposed, true);
});

test('routes notifications after initialization', async () => {
  const transport = new FakeTransport();
  const client = await CodexAppServerClient.connect(
    async () => transport,
    'codex',
    100
  );
  const notifications: unknown[] = [];
  client.onNotification((notification) => notifications.push(notification));

  transport.emitMessage({ method: 'warning', params: { message: 'Careful' } });

  assert.deepEqual(notifications, [
    { method: 'warning', params: { message: 'Careful' } }
  ]);
  client.dispose();
});

test('reports an unexpected transport close', async () => {
  const transport = new FakeTransport();
  const client = await CodexAppServerClient.connect(
    async () => transport,
    'codex',
    100
  );
  const reasons: string[] = [];
  client.onDidClose((reason) => reasons.push(reason));

  transport.emitClose('process exited');

  assert.deepEqual(reasons, ['process exited']);
});

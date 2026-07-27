import assert from 'node:assert/strict';
import test from 'node:test';
import { CodexRuntimeService } from './service';
import type { CodexMessageTransport, RuntimeDisposable } from './types';

class TestTransport implements CodexMessageTransport {
  readonly sent: unknown[] = [];
  private readonly messages = new Set<(message: unknown) => void>();
  private readonly closes = new Set<(reason: string) => void>();

  send(message: unknown): void {
    this.sent.push(message);
    const request = message as { id?: number; method?: string };
    if (request.method === 'initialize') {
      this.reply({ id: request.id, result: { userAgent: 'codex-test' } });
    }
    if (request.method === 'thread/start') {
      this.reply({ id: request.id, result: { thread: { id: 'thread-new' }, approvalsReviewer: 'user' } });
    }
    if (request.method === 'thread/resume') {
      this.reply({
        id: request.id,
        result: {
          thread: {
            id: 'thread-saved',
            turns: [
              {
                id: 'turn-restored',
                status: 'completed',
                startedAt: 100,
                completedAt: 101,
                items: [
                  {
                    type: 'userMessage',
                    id: 'user-1',
                    content: [{ type: 'text', text: 'Resume this work', text_elements: [] }]
                  },
                  {
                    type: 'agentMessage',
                    id: 'agent-1',
                    text: 'The previous work is restored.',
                    phase: null,
                    memoryCitation: null
                  }
                ]
              }
            ]
          },
          model: 'gpt-test',
          modelProvider: 'openai',
          cwd: '/workspace',
          approvalsReviewer: 'user'
        }
      });
    }
    if (request.method === 'turn/start') {
      this.reply({ id: request.id, result: { turn: { id: 'turn-1' } } });
      queueMicrotask(() => {
        this.emit({
          method: 'turn/started',
          params: { threadId: 'thread-new', turn: { id: 'turn-1', startedAt: 200 } }
        });
        this.emit({
          method: 'item/completed',
          params: {
            threadId: 'thread-new',
            turnId: 'turn-1',
            item: { type: 'agentMessage', id: 'item-1', text: 'Hello world' }
          }
        });
        this.emit({
          method: 'turn/completed',
          params: {
            threadId: 'thread-new',
            turn: { id: 'turn-1', status: 'completed', error: null, completedAt: 201 }
          }
        });
      });
    }
  }

  onMessage(listener: (message: unknown) => void): RuntimeDisposable {
    this.messages.add(listener);
    return { dispose: () => this.messages.delete(listener) };
  }

  onClose(listener: (reason: string) => void): RuntimeDisposable {
    this.closes.add(listener);
    return { dispose: () => this.closes.delete(listener) };
  }

  dispose(): void {
    this.messages.clear();
    this.closes.clear();
  }

  private emit(message: unknown): void {
    for (const listener of this.messages) {
      listener(message);
    }
  }

  private reply(message: unknown): void {
    queueMicrotask(() => this.emit(message));
  }
}

async function connectedService(): Promise<{
  service: CodexRuntimeService;
  transport: TestTransport;
}> {
  const transport = new TestTransport();
  const service = new CodexRuntimeService('codex', async () => transport);
  await service.connect();
  return { service, transport };
}

test('starts a new session and exposes it as the next resume candidate', async () => {
  const { service } = await connectedService();

  await service.startThread('/workspace');

  assert.equal(service.status.thread.thread?.id, 'thread-new');
  assert.equal(service.status.resumeCandidate?.threadId, 'thread-new');
  assert.equal(service.status.turn.phase, 'idle');
  service.dispose();
});

test('resumes the saved thread and restores its last completed exchange', async () => {
  const { service, transport } = await connectedService();
  service.setResumeCandidate({ threadId: 'thread-saved', savedAt: 50 });

  await service.resumeThread(undefined, '/workspace');

  assert.deepEqual(transport.sent[2], {
    id: 1,
    method: 'thread/resume',
    params: {
      threadId: 'thread-saved',
      cwd: '/workspace',
      approvalsReviewer: 'user'
    }
  });
  assert.equal(service.status.thread.phase, 'ready');
  assert.equal(service.status.thread.thread?.id, 'thread-saved');
  assert.equal(service.status.turn.phase, 'completed');
  assert.equal(service.status.turn.turnId, 'turn-restored');
  assert.equal(service.status.turn.userMessage, 'Resume this work');
  assert.equal(service.status.turn.assistantMessage, 'The previous work is restored.');
  assert.equal(service.status.resumeCandidate?.savedAt, 50);
  service.dispose();
});

test('never resumes automatically when connecting', async () => {
  const { service, transport } = await connectedService();
  service.setResumeCandidate({ threadId: 'thread-saved', savedAt: 50 });

  assert.equal(service.status.thread.phase, 'none');
  assert.equal(transport.sent.some((message) => (message as { method?: string }).method === 'thread/resume'), false);
  service.dispose();
});

test('disconnect preserves the saved session offer but clears active runtime state', async () => {
  const { service } = await connectedService();
  service.setResumeCandidate({ threadId: 'thread-saved', savedAt: 50 });
  await service.resumeThread();

  service.disconnect();

  assert.equal(service.status.phase, 'disconnected');
  assert.equal(service.status.thread.phase, 'none');
  assert.equal(service.status.turn.phase, 'idle');
  assert.equal(service.status.resumeCandidate?.threadId, 'thread-saved');
});

test('a normal new turn still completes after session work', async () => {
  const { service } = await connectedService();
  await service.startThread('/workspace');

  await service.startTurn('Hello', '/workspace');
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(service.status.turn.phase, 'completed');
  assert.equal(service.status.turn.assistantMessage, 'Hello world');
  service.dispose();
});

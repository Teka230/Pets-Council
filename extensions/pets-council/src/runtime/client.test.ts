import assert from 'node:assert/strict';
import test from 'node:test';
import { CodexAppServerClient } from './client';
import type { CodexMessageTransport, RuntimeDisposable } from './types';

class FakeTransport implements CodexMessageTransport {
  readonly sent: unknown[] = [];
  private readonly messages = new Set<(message: unknown) => void>();
  private readonly closes = new Set<(reason: string) => void>();

  send(message: unknown): void {
    this.sent.push(message);
    const request = message as { id?: number; method?: string };
    if (request.method === 'initialize') {
      this.reply({ id: request.id, result: { userAgent: 'codex-test/1.0' } });
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
            sessionId: 'session-1',
            turns: [
              {
                id: 'turn-old',
                status: 'completed',
                startedAt: 100,
                completedAt: 101,
                items: [
                  {
                    type: 'userMessage',
                    id: 'user-1',
                    content: [{ type: 'text', text: 'What changed?', text_elements: [] }]
                  },
                  {
                    type: 'agentMessage',
                    id: 'agent-1',
                    text: 'The runtime now supports resume.',
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
          approvalPolicy: 'on-request',
          approvalsReviewer: 'user'
        }
      });
    }
    if (request.method === 'turn/start') {
      this.reply({ id: request.id, result: { turn: { id: 'turn-1' } } });
    }
    if (request.method === 'turn/interrupt') {
      this.reply({ id: request.id, result: {} });
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

  emit(message: unknown): void {
    for (const listener of this.messages) {
      listener(message);
    }
  }

  private reply(message: unknown): void {
    queueMicrotask(() => this.emit(message));
  }
}

test('performs the current initialize handshake', async () => {
  const transport = new FakeTransport();
  const client = await CodexAppServerClient.connect(async () => transport, 'codex', 100);

  assert.deepEqual(transport.sent.slice(0, 2), [
    {
      id: 1,
      method: 'initialize',
      params: {
        clientInfo: { name: 'pets_council', title: 'Pets Council', version: '0.9.0' },
        capabilities: {}
      }
    },
    { method: 'initialized' }
  ]);
  client.dispose();
});

test('resumes a thread by id and restores the last completed text exchange', async () => {
  const transport = new FakeTransport();
  const client = await CodexAppServerClient.connect(async () => transport, 'codex', 100);

  const thread = await client.resumeThread('thread-saved', '/workspace');

  assert.deepEqual(transport.sent[2], {
    id: 1,
    method: 'thread/resume',
    params: {
      threadId: 'thread-saved',
      cwd: '/workspace',
      approvalsReviewer: 'user'
    }
  });
  assert.equal(thread.id, 'thread-saved');
  assert.deepEqual(thread.lastCompletedTurn, {
    turnId: 'turn-old',
    userMessage: 'What changed?',
    assistantMessage: 'The runtime now supports resume.',
    startedAt: 100,
    completedAt: 101
  });
  client.dispose();
});

test('starts text turns, interrupts, and handles approval responses', async () => {
  const transport = new FakeTransport();
  const client = await CodexAppServerClient.connect(async () => transport, 'codex', 100);

  assert.equal(await client.startTurn('thread-1', 'Explain', '/workspace'), 'turn-1');
  await client.interruptTurn('thread-1', 'turn-1');
  client.respond('approval-1', { decision: 'accept' });

  assert.deepEqual(transport.sent.at(-2), {
    id: 2,
    method: 'turn/interrupt',
    params: { threadId: 'thread-1', turnId: 'turn-1' }
  });
  assert.deepEqual(transport.sent.at(-1), {
    id: 'approval-1',
    result: { decision: 'accept' }
  });
  client.dispose();
});

import { CodexAppServerClient } from './client';
import type {
  CodexRuntimeStatus,
  CodexThreadStatus,
  CodexTransportFactory,
  CodexTurnStatus,
  JsonRpcNotification,
  RuntimeDisposable
} from './types';

export class CodexRuntimeService {
  private client: CodexAppServerClient | undefined;
  private clientCloseSubscription: RuntimeDisposable | undefined;
  private clientNotificationSubscription: RuntimeDisposable | undefined;
  private readonly listeners = new Set<(status: CodexRuntimeStatus) => void>();
  private connectionSequence = 0;
  private threadSequence = 0;
  private turnSequence = 0;
  private statusValue: CodexRuntimeStatus;

  constructor(
    binary: string,
    private readonly transportFactory: CodexTransportFactory
  ) {
    this.statusValue = disconnectedStatus(binary);
  }

  get status(): CodexRuntimeStatus {
    return this.statusValue;
  }

  setBinary(binary: string): void {
    const normalized = binary.trim() || 'codex';
    if (normalized === this.statusValue.binary) {
      return;
    }

    this.disconnect();
    this.setStatus(disconnectedStatus(normalized));
  }

  async connect(): Promise<void> {
    if (this.statusValue.phase === 'connecting' || this.statusValue.phase === 'ready') {
      return;
    }

    const sequence = ++this.connectionSequence;
    const binary = this.statusValue.binary;
    this.setStatus({
      phase: 'connecting',
      binary,
      message: 'Starting codex app-server and negotiating the initialize handshake…',
      thread: noThreadStatus(),
      turn: idleTurnStatus()
    });

    try {
      const client = await CodexAppServerClient.connect(this.transportFactory, binary);
      if (sequence !== this.connectionSequence) {
        client.dispose();
        return;
      }

      this.replaceClient(client);
      this.setStatus({
        phase: 'ready',
        binary,
        message: 'Connected. No thread has been created and no prompt has been sent.',
        server: client.serverInfo,
        thread: noThreadStatus(),
        turn: idleTurnStatus()
      });
    } catch (error) {
      if (sequence !== this.connectionSequence) {
        return;
      }

      this.replaceClient(undefined);
      this.setStatus({
        phase: 'error',
        binary,
        message: normalizeError(error),
        thread: noThreadStatus(),
        turn: idleTurnStatus()
      });
    }
  }

  async startThread(cwd?: string): Promise<void> {
    if (this.statusValue.phase !== 'ready' || !this.client) {
      this.setThreadStatus({
        phase: 'error',
        message: 'Connect Codex before starting a session.'
      });
      return;
    }

    if (this.statusValue.thread.phase === 'starting' || isTurnRunning(this.statusValue.turn)) {
      return;
    }

    const client = this.client;
    const sequence = ++this.threadSequence;
    ++this.turnSequence;
    this.setStatus({
      ...this.statusValue,
      thread: {
        phase: 'starting',
        message: 'Creating a Codex thread for the current workspace…'
      },
      turn: idleTurnStatus()
    });

    try {
      const thread = await client.startThread(cwd);
      if (
        sequence !== this.threadSequence
        || this.client !== client
        || this.statusValue.phase !== 'ready'
      ) {
        return;
      }

      this.setStatus({
        ...this.statusValue,
        thread: {
          phase: 'ready',
          message: 'Thread ready. No turn has been started and no prompt has been sent.',
          thread
        },
        turn: idleTurnStatus()
      });
    } catch (error) {
      if (sequence !== this.threadSequence || this.client !== client) {
        return;
      }

      this.setThreadStatus({
        phase: 'error',
        message: normalizeError(error)
      });
    }
  }

  async startTurn(userMessage: string, cwd?: string): Promise<void> {
    const text = userMessage.trim();
    if (!text) {
      this.setTurnStatus({
        phase: 'error',
        message: 'Write a prompt before starting a Codex turn.'
      });
      return;
    }

    const thread = this.statusValue.thread.thread;
    if (
      this.statusValue.phase !== 'ready'
      || !this.client
      || this.statusValue.thread.phase !== 'ready'
      || !thread
    ) {
      this.setTurnStatus({
        phase: 'error',
        message: 'Start a Codex session before sending a prompt.',
        userMessage: text
      });
      return;
    }

    if (isTurnRunning(this.statusValue.turn)) {
      return;
    }

    const client = this.client;
    const sequence = ++this.turnSequence;
    this.setTurnStatus({
      phase: 'starting',
      message: 'Sending the prompt to Codex…',
      userMessage: text,
      assistantMessage: ''
    });

    try {
      const turnId = await client.startTurn(thread.id, text, cwd);
      if (
        sequence !== this.turnSequence
        || this.client !== client
        || this.statusValue.phase !== 'ready'
      ) {
        return;
      }

      this.setTurnStatus({
        ...this.statusValue.turn,
        phase: 'streaming',
        message: 'Codex is responding…',
        turnId,
        userMessage: text,
        assistantMessage: this.statusValue.turn.assistantMessage ?? ''
      });
    } catch (error) {
      if (sequence !== this.turnSequence || this.client !== client) {
        return;
      }

      this.setTurnStatus({
        phase: 'error',
        message: normalizeError(error),
        userMessage: text,
        assistantMessage: this.statusValue.turn.assistantMessage
      });
    }
  }

  clearThread(): void {
    ++this.threadSequence;
    ++this.turnSequence;
    if (this.statusValue.phase === 'ready') {
      this.setStatus({
        ...this.statusValue,
        thread: noThreadStatus(),
        turn: idleTurnStatus()
      });
    }
  }

  disconnect(): void {
    ++this.connectionSequence;
    ++this.threadSequence;
    ++this.turnSequence;
    const binary = this.statusValue.binary;
    this.replaceClient(undefined);
    this.setStatus(disconnectedStatus(binary));
  }

  onDidChange(listener: (status: CodexRuntimeStatus) => void): RuntimeDisposable {
    this.listeners.add(listener);
    return disposable(() => this.listeners.delete(listener));
  }

  dispose(): void {
    ++this.connectionSequence;
    ++this.threadSequence;
    ++this.turnSequence;
    this.replaceClient(undefined);
    this.listeners.clear();
  }

  private replaceClient(client: CodexAppServerClient | undefined): void {
    this.clientCloseSubscription?.dispose();
    this.clientCloseSubscription = undefined;
    this.clientNotificationSubscription?.dispose();
    this.clientNotificationSubscription = undefined;

    const previous = this.client;
    this.client = client;
    previous?.dispose();

    if (!client) {
      return;
    }

    this.clientCloseSubscription = client.onDidClose((reason) => {
      if (this.client !== client) {
        return;
      }

      this.client = undefined;
      this.clientCloseSubscription?.dispose();
      this.clientCloseSubscription = undefined;
      this.clientNotificationSubscription?.dispose();
      this.clientNotificationSubscription = undefined;
      ++this.threadSequence;
      ++this.turnSequence;
      this.setStatus({
        phase: 'error',
        binary: this.statusValue.binary,
        message: reason,
        thread: noThreadStatus(),
        turn: idleTurnStatus()
      });
    });

    this.clientNotificationSubscription = client.onNotification((notification) => {
      if (this.client === client) {
        this.handleNotification(notification);
      }
    });
  }

  private handleNotification(notification: JsonRpcNotification): void {
    const params = objectValue(notification.params);
    if (!params) {
      return;
    }

    const activeThreadId = this.statusValue.thread.thread?.id;
    const notificationThreadId = optionalString(params.threadId);
    if (activeThreadId && notificationThreadId && notificationThreadId !== activeThreadId) {
      return;
    }

    if (notification.method === 'turn/started') {
      const turn = objectValue(params.turn);
      const turnId = optionalString(turn?.id);
      if (!turnId) {
        return;
      }

      this.setTurnStatus({
        ...this.statusValue.turn,
        phase: 'streaming',
        message: 'Codex is responding…',
        turnId,
        startedAt: numberValue(turn?.startedAt) ?? Date.now() / 1000,
        assistantMessage: this.statusValue.turn.assistantMessage ?? ''
      });
      return;
    }

    if (notification.method === 'item/agentMessage/delta') {
      const delta = optionalString(params.delta);
      const turnId = optionalString(params.turnId);
      if (!delta || !matchesActiveTurn(this.statusValue.turn, turnId)) {
        return;
      }

      this.setTurnStatus({
        ...this.statusValue.turn,
        phase: 'streaming',
        message: 'Codex is responding…',
        turnId: this.statusValue.turn.turnId ?? turnId,
        assistantMessage: `${this.statusValue.turn.assistantMessage ?? ''}${delta}`
      });
      return;
    }

    if (notification.method === 'item/completed') {
      const turnId = optionalString(params.turnId);
      if (!matchesActiveTurn(this.statusValue.turn, turnId)) {
        return;
      }

      const item = objectValue(params.item);
      if (item?.type === 'agentMessage' && typeof item.text === 'string') {
        this.setTurnStatus({
          ...this.statusValue.turn,
          turnId: this.statusValue.turn.turnId ?? turnId,
          assistantMessage: item.text
        });
      }
      return;
    }

    if (notification.method === 'turn/completed') {
      const turn = objectValue(params.turn);
      const turnId = optionalString(turn?.id) ?? optionalString(params.turnId);
      if (!matchesActiveTurn(this.statusValue.turn, turnId)) {
        return;
      }

      const status = optionalString(turn?.status);
      const error = objectValue(turn?.error);
      const failed = status === 'failed' || Boolean(error);
      this.setTurnStatus({
        ...this.statusValue.turn,
        phase: failed ? 'error' : 'completed',
        message: failed
          ? optionalString(error?.message) ?? 'The Codex turn failed.'
          : 'Codex completed the turn.',
        turnId: this.statusValue.turn.turnId ?? turnId,
        completedAt: numberValue(turn?.completedAt) ?? Date.now() / 1000
      });
    }
  }

  private setThreadStatus(thread: CodexThreadStatus): void {
    this.setStatus({
      ...this.statusValue,
      thread
    });
  }

  private setTurnStatus(turn: CodexTurnStatus): void {
    this.setStatus({
      ...this.statusValue,
      turn
    });
  }

  private setStatus(status: CodexRuntimeStatus): void {
    this.statusValue = status;
    for (const listener of this.listeners) {
      listener(status);
    }
  }
}

export function resolveCodexBinary(
  configuredValue: string | undefined,
  environment: NodeJS.ProcessEnv = process.env
): string {
  const configured = configuredValue?.trim();
  if (configured) {
    return configured;
  }

  const fromEnvironment = environment.CODEX_BIN?.trim();
  return fromEnvironment || 'codex';
}

function disconnectedStatus(binary: string): CodexRuntimeStatus {
  return {
    phase: 'disconnected',
    binary,
    message: 'Disconnected. Connecting is always an explicit user action.',
    thread: noThreadStatus(),
    turn: idleTurnStatus()
  };
}

function noThreadStatus(): CodexThreadStatus {
  return {
    phase: 'none',
    message: 'No Codex thread exists for this runtime connection.'
  };
}

function idleTurnStatus(): CodexTurnStatus {
  return {
    phase: 'idle',
    message: 'No Codex turn has been started in this session.'
  };
}

function isTurnRunning(turn: CodexTurnStatus): boolean {
  return turn.phase === 'starting' || turn.phase === 'streaming';
}

function matchesActiveTurn(turn: CodexTurnStatus, candidateId: string | undefined): boolean {
  return !turn.turnId || !candidateId || turn.turnId === candidateId;
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? value as Record<string, unknown>
    : undefined;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function normalizeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function disposable(dispose: () => void): RuntimeDisposable {
  return { dispose };
}

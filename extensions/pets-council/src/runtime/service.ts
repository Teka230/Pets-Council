import { CodexAppServerClient } from './client';
import type {
  CodexRuntimeStatus,
  CodexThreadStatus,
  CodexTransportFactory,
  RuntimeDisposable
} from './types';

export class CodexRuntimeService {
  private client: CodexAppServerClient | undefined;
  private clientCloseSubscription: RuntimeDisposable | undefined;
  private readonly listeners = new Set<(status: CodexRuntimeStatus) => void>();
  private connectionSequence = 0;
  private threadSequence = 0;
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
      thread: noThreadStatus()
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
        thread: noThreadStatus()
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
        thread: noThreadStatus()
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

    if (this.statusValue.thread.phase === 'starting') {
      return;
    }

    const client = this.client;
    const sequence = ++this.threadSequence;
    this.setThreadStatus({
      phase: 'starting',
      message: 'Creating a Codex thread for the current workspace…'
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

      this.setThreadStatus({
        phase: 'ready',
        message: 'Thread ready. No turn has been started and no prompt has been sent.',
        thread
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

  clearThread(): void {
    ++this.threadSequence;
    if (this.statusValue.phase === 'ready') {
      this.setThreadStatus(noThreadStatus());
    }
  }

  disconnect(): void {
    ++this.connectionSequence;
    ++this.threadSequence;
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
    this.replaceClient(undefined);
    this.listeners.clear();
  }

  private replaceClient(client: CodexAppServerClient | undefined): void {
    this.clientCloseSubscription?.dispose();
    this.clientCloseSubscription = undefined;

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
      ++this.threadSequence;
      this.setStatus({
        phase: 'error',
        binary: this.statusValue.binary,
        message: reason,
        thread: noThreadStatus()
      });
    });
  }

  private setThreadStatus(thread: CodexThreadStatus): void {
    this.setStatus({
      ...this.statusValue,
      thread
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
    thread: noThreadStatus()
  };
}

function noThreadStatus(): CodexThreadStatus {
  return {
    phase: 'none',
    message: 'No Codex thread exists for this runtime connection.'
  };
}

function normalizeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function disposable(dispose: () => void): RuntimeDisposable {
  return { dispose };
}

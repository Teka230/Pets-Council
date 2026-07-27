import { CodexAppServerClient } from './client';
import type {
  CodexRuntimeStatus,
  CodexTransportFactory,
  RuntimeDisposable
} from './types';

export class CodexRuntimeService {
  private client: CodexAppServerClient | undefined;
  private clientCloseSubscription: RuntimeDisposable | undefined;
  private readonly listeners = new Set<(status: CodexRuntimeStatus) => void>();
  private connectionSequence = 0;
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
      message: 'Starting codex app-server and negotiating the initialize handshake…'
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
        server: client.serverInfo
      });
    } catch (error) {
      if (sequence !== this.connectionSequence) {
        return;
      }

      this.replaceClient(undefined);
      this.setStatus({
        phase: 'error',
        binary,
        message: normalizeError(error)
      });
    }
  }

  disconnect(): void {
    ++this.connectionSequence;
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
      this.setStatus({
        phase: 'error',
        binary: this.statusValue.binary,
        message: reason
      });
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
    message: 'Disconnected. Connecting is always an explicit user action.'
  };
}

function normalizeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function disposable(dispose: () => void): RuntimeDisposable {
  return { dispose };
}

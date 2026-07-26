import type {
  CodexInitializeResult,
  CodexMessageTransport,
  CodexTransportFactory,
  JsonRpcId,
  JsonRpcNotification,
  JsonRpcResponse,
  RuntimeDisposable
} from './types';

type PendingRequest = Readonly<{
  resolve(value: unknown): void;
  reject(error: Error): void;
  timeout: NodeJS.Timeout;
}>;

const DEFAULT_REQUEST_TIMEOUT_MS = 5_000;

export class CodexAppServerClient {
  private nextRequestId = 1;
  private readonly pending = new Map<JsonRpcId, PendingRequest>();
  private readonly notificationListeners = new Set<(notification: JsonRpcNotification) => void>();
  private readonly closeListeners = new Set<(reason: string) => void>();
  private readonly messageSubscription: RuntimeDisposable;
  private readonly closeSubscription: RuntimeDisposable;
  private closed = false;

  private constructor(
    private readonly transport: CodexMessageTransport,
    readonly serverInfo: CodexInitializeResult
  ) {
    this.messageSubscription = transport.onMessage((message) => this.handleMessage(message));
    this.closeSubscription = transport.onClose((reason) => this.close(reason, false));
  }

  static async connect(
    factory: CodexTransportFactory,
    binary: string,
    timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS
  ): Promise<CodexAppServerClient> {
    const transport = await factory(binary);
    const bootstrap = new BootstrapClient(transport);

    try {
      const result = await bootstrap.initialize(timeoutMs);
      bootstrap.detach();
      return new CodexAppServerClient(transport, result);
    } catch (error) {
      bootstrap.dispose();
      throw error;
    }
  }

  request(method: string, params?: unknown, timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS): Promise<unknown> {
    if (this.closed) {
      return Promise.reject(new Error('Codex app-server connection is closed.'));
    }

    const id = this.nextRequestId++;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Codex app-server request timed out: ${method}`));
      }, timeoutMs);

      this.pending.set(id, { resolve, reject, timeout });
      this.transport.send({ id, method, ...(params === undefined ? {} : { params }) });
    });
  }

  notify(method: string, params?: unknown): void {
    if (this.closed) {
      throw new Error('Codex app-server connection is closed.');
    }

    this.transport.send({ method, ...(params === undefined ? {} : { params }) });
  }

  onNotification(listener: (notification: JsonRpcNotification) => void): RuntimeDisposable {
    this.notificationListeners.add(listener);
    return disposable(() => this.notificationListeners.delete(listener));
  }

  onDidClose(listener: (reason: string) => void): RuntimeDisposable {
    this.closeListeners.add(listener);
    return disposable(() => this.closeListeners.delete(listener));
  }

  dispose(): void {
    this.close('Disconnected by Pets Council.', true);
  }

  private handleMessage(message: unknown): void {
    if (isJsonRpcResponse(message)) {
      const pending = this.pending.get(message.id);
      if (!pending) {
        return;
      }

      this.pending.delete(message.id);
      clearTimeout(pending.timeout);

      if (message.error) {
        pending.reject(new Error(
          `Codex app-server error ${message.error.code}: ${message.error.message}`
        ));
        return;
      }

      pending.resolve(message.result);
      return;
    }

    if (isJsonRpcNotification(message)) {
      for (const listener of this.notificationListeners) {
        listener(message);
      }
    }
  }

  private close(reason: string, disposeTransport: boolean): void {
    if (this.closed) {
      return;
    }

    this.closed = true;
    this.messageSubscription.dispose();
    this.closeSubscription.dispose();

    if (disposeTransport) {
      this.transport.dispose();
    }

    for (const request of this.pending.values()) {
      clearTimeout(request.timeout);
      request.reject(new Error(reason));
    }
    this.pending.clear();

    for (const listener of this.closeListeners) {
      listener(reason);
    }
    this.closeListeners.clear();
    this.notificationListeners.clear();
  }
}

class BootstrapClient {
  private nextRequestId = 1;
  private readonly pending = new Map<JsonRpcId, PendingRequest>();
  private readonly messageSubscription: RuntimeDisposable;
  private readonly closeSubscription: RuntimeDisposable;
  private detached = false;

  constructor(private readonly transport: CodexMessageTransport) {
    this.messageSubscription = transport.onMessage((message) => this.handleMessage(message));
    this.closeSubscription = transport.onClose((reason) => this.rejectAll(reason));
  }

  async initialize(timeoutMs: number): Promise<CodexInitializeResult> {
    const result = await this.request('initialize', {
      clientInfo: {
        name: 'pets_council',
        title: 'Pets Council',
        version: '0.4.0'
      },
      capabilities: {}
    }, timeoutMs);

    const serverInfo = parseInitializeResult(result);
    this.transport.send({ method: 'initialized' });
    return serverInfo;
  }

  detach(): void {
    this.detached = true;
    this.messageSubscription.dispose();
    this.closeSubscription.dispose();
  }

  dispose(): void {
    if (!this.detached) {
      this.messageSubscription.dispose();
      this.closeSubscription.dispose();
      this.rejectAll('Codex app-server initialization was cancelled.');
      this.transport.dispose();
    }
  }

  private request(method: string, params: unknown, timeoutMs: number): Promise<unknown> {
    const id = this.nextRequestId++;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Codex app-server request timed out: ${method}`));
      }, timeoutMs);

      this.pending.set(id, { resolve, reject, timeout });
      this.transport.send({ id, method, params });
    });
  }

  private handleMessage(message: unknown): void {
    if (!isJsonRpcResponse(message)) {
      return;
    }

    const pending = this.pending.get(message.id);
    if (!pending) {
      return;
    }

    this.pending.delete(message.id);
    clearTimeout(pending.timeout);

    if (message.error) {
      pending.reject(new Error(
        `Codex app-server error ${message.error.code}: ${message.error.message}`
      ));
      return;
    }

    pending.resolve(message.result);
  }

  private rejectAll(reason: string): void {
    for (const request of this.pending.values()) {
      clearTimeout(request.timeout);
      request.reject(new Error(reason));
    }
    this.pending.clear();
  }
}

function parseInitializeResult(value: unknown): CodexInitializeResult {
  if (typeof value !== 'object' || value === null) {
    throw new Error('Codex app-server returned an invalid initialize result.');
  }

  const candidate = value as Record<string, unknown>;
  return {
    userAgent: optionalString(candidate.userAgent),
    codexHome: optionalString(candidate.codexHome),
    platformFamily: optionalString(candidate.platformFamily),
    platformOs: optionalString(candidate.platformOs)
  };
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function isJsonRpcResponse(value: unknown): value is JsonRpcResponse {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (typeof candidate.id === 'number' || typeof candidate.id === 'string')
    && typeof candidate.method !== 'string';
}

function isJsonRpcNotification(value: unknown): value is JsonRpcNotification {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return typeof candidate.method === 'string' && candidate.id === undefined;
}

function disposable(dispose: () => void): RuntimeDisposable {
  return { dispose };
}

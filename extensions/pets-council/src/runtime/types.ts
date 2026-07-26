export type RuntimeDisposable = Readonly<{
  dispose(): void;
}>;

export type JsonRpcId = number | string;

export type JsonRpcRequest = Readonly<{
  id: JsonRpcId;
  method: string;
  params?: unknown;
}>;

export type JsonRpcNotification = Readonly<{
  method: string;
  params?: unknown;
}>;

export type JsonRpcError = Readonly<{
  code: number;
  message: string;
  data?: unknown;
}>;

export type JsonRpcResponse = Readonly<{
  id: JsonRpcId;
  result?: unknown;
  error?: JsonRpcError;
}>;

export type CodexInitializeResult = Readonly<{
  userAgent?: string;
  codexHome?: string;
  platformFamily?: string;
  platformOs?: string;
}>;

export type CodexRuntimePhase = 'disconnected' | 'connecting' | 'ready' | 'error';

export type CodexRuntimeStatus = Readonly<{
  phase: CodexRuntimePhase;
  binary: string;
  message: string;
  server?: CodexInitializeResult;
}>;

export interface CodexMessageTransport {
  send(message: unknown): void;
  onMessage(listener: (message: unknown) => void): RuntimeDisposable;
  onClose(listener: (reason: string) => void): RuntimeDisposable;
  dispose(): void;
}

export type CodexTransportFactory = (
  binary: string
) => Promise<CodexMessageTransport>;

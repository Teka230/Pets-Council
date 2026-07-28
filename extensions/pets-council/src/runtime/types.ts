import type { CodexModelDescriptor, CodexModelSelection, CodexTokenUsage } from './modelSelection';

export type RuntimeDisposable = Readonly<{ dispose(): void }>;
export type JsonRpcId = number | string;
export type JsonRpcRequest = Readonly<{ id: JsonRpcId; method: string; params?: unknown }>;
export type JsonRpcServerRequest = JsonRpcRequest;
export type JsonRpcNotification = Readonly<{ method: string; params?: unknown }>;
export type JsonRpcError = Readonly<{ code: number; message: string; data?: unknown }>;
export type JsonRpcResponse = Readonly<{ id: JsonRpcId; result?: unknown; error?: JsonRpcError }>;

export type CodexInitializeResult = Readonly<{ userAgent?: string; codexHome?: string; platformFamily?: string; platformOs?: string }>;
export type CodexRestoredTurn = Readonly<{ turnId: string; userMessage: string; assistantMessage: string; startedAt?: number; completedAt?: number }>;
export type CodexThreadInfo = Readonly<{ id: string; sessionId?: string; preview?: string; cwd?: string; model?: string; modelProvider?: string; reasoningEffort?: string; approvalPolicy?: string; approvalsReviewer?: string; lastCompletedTurn?: CodexRestoredTurn }>;
export type CodexThreadPhase = 'none' | 'starting' | 'ready' | 'error';
export type CodexThreadStatus = Readonly<{ phase: CodexThreadPhase; message: string; thread?: CodexThreadInfo }>;
export type CodexTurnPhase = 'idle' | 'starting' | 'streaming' | 'completed' | 'error';
export type CodexTurnStatus = Readonly<{ phase: CodexTurnPhase; message: string; turnId?: string; userMessage?: string; assistantMessage?: string; startedAt?: number; completedAt?: number }>;

export type CodexApprovalKind = 'commandExecution' | 'fileChange';
export type CodexApprovalDecision = 'accept' | 'decline';
export type CodexApprovalRequest = Readonly<{ requestId: JsonRpcId; kind: CodexApprovalKind; threadId: string; turnId: string; itemId: string; reason?: string; command?: string; cwd?: string; grantRoot?: string; startedAtMs?: number }>;
export type CodexResumeCandidate = Readonly<{ threadId: string; savedAt: number }>;

export type CodexRuntimePhase = 'disconnected' | 'connecting' | 'ready' | 'error';
export type CodexRuntimeStatus = Readonly<{
  phase: CodexRuntimePhase;
  binary: string;
  message: string;
  server?: CodexInitializeResult;
  models: readonly CodexModelDescriptor[];
  modelSelection?: CodexModelSelection;
  tokenUsage?: CodexTokenUsage;
  thread: CodexThreadStatus;
  turn: CodexTurnStatus;
  approval?: CodexApprovalRequest;
  resumeCandidate?: CodexResumeCandidate;
}>;

export interface CodexMessageTransport { send(message: unknown): void; onMessage(listener: (message: unknown) => void): RuntimeDisposable; onClose(listener: (reason: string) => void): RuntimeDisposable; dispose(): void; }
export type CodexTransportFactory = (binary: string) => Promise<CodexMessageTransport>;

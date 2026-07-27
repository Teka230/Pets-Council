import type {
  CodexInitializeResult,
  CodexMessageTransport,
  CodexThreadInfo,
  CodexTransportFactory,
  JsonRpcId,
  JsonRpcNotification,
  JsonRpcResponse,
  JsonRpcServerRequest,
  RuntimeDisposable
} from './types';

type Pending = Readonly<{ resolve(value: unknown): void; reject(error: Error): void; timeout: NodeJS.Timeout }>;
const TIMEOUT = 5_000;

export class CodexAppServerClient {
  private nextId = 1;
  private readonly pending = new Map<JsonRpcId, Pending>();
  private readonly notifications = new Set<(value: JsonRpcNotification) => void>();
  private readonly requests = new Set<(value: JsonRpcServerRequest) => void>();
  private readonly closes = new Set<(reason: string) => void>();
  private readonly messageSub: RuntimeDisposable;
  private readonly closeSub: RuntimeDisposable;
  private closed = false;

  private constructor(private readonly transport: CodexMessageTransport, readonly serverInfo: CodexInitializeResult) {
    this.messageSub = transport.onMessage((message) => this.handle(message));
    this.closeSub = transport.onClose((reason) => this.close(reason, false));
  }

  static async connect(factory: CodexTransportFactory, binary: string, timeoutMs = TIMEOUT): Promise<CodexAppServerClient> {
    const transport = await factory(binary);
    const bootstrap = new Bootstrap(transport);
    try {
      const info = await bootstrap.initialize(timeoutMs);
      bootstrap.detach();
      return new CodexAppServerClient(transport, info);
    } catch (error) {
      bootstrap.dispose();
      throw error;
    }
  }

  request<T = unknown>(method: string, params?: unknown, timeoutMs = TIMEOUT): Promise<T> {
    if (this.closed) return Promise.reject(new Error('Codex app-server connection is closed.'));
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => { this.pending.delete(id); reject(new Error(`Codex app-server request timed out: ${method}`)); }, timeoutMs);
      this.pending.set(id, { resolve: (value) => resolve(value as T), reject, timeout });
      this.transport.send({ id, method, ...(params === undefined ? {} : { params }) });
    });
  }

  async startThread(cwd?: string): Promise<CodexThreadInfo> {
    return parseThread(await this.request('thread/start', { ...(cwd ? { cwd } : {}), approvalsReviewer: 'user' }));
  }

  async startTurn(threadId: string, text: string, cwd?: string): Promise<string> {
    return parseTurnId(await this.request('turn/start', { threadId, input: [{ type: 'text', text }], ...(cwd ? { cwd } : {}), approvalsReviewer: 'user' }));
  }

  async interruptTurn(threadId: string, turnId: string): Promise<void> {
    await this.request('turn/interrupt', { threadId, turnId });
  }

  respond(requestId: JsonRpcId, result: unknown): void {
    if (this.closed) throw new Error('Codex app-server connection is closed.');
    this.transport.send({ id: requestId, result });
  }

  onNotification(listener: (value: JsonRpcNotification) => void): RuntimeDisposable { this.notifications.add(listener); return disposable(() => this.notifications.delete(listener)); }
  onRequest(listener: (value: JsonRpcServerRequest) => void): RuntimeDisposable { this.requests.add(listener); return disposable(() => this.requests.delete(listener)); }
  onDidClose(listener: (reason: string) => void): RuntimeDisposable { this.closes.add(listener); return disposable(() => this.closes.delete(listener)); }
  dispose(): void { this.close('Disconnected by Pets Council.', true); }

  private handle(message: unknown): void {
    if (isServerRequest(message)) { for (const listener of this.requests) listener(message); return; }
    if (isResponse(message)) {
      const pending = this.pending.get(message.id); if (!pending) return;
      this.pending.delete(message.id); clearTimeout(pending.timeout);
      if (message.error) pending.reject(new Error(`Codex app-server error ${message.error.code}: ${message.error.message}`));
      else pending.resolve(message.result);
      return;
    }
    if (isNotification(message)) for (const listener of this.notifications) listener(message);
  }

  private close(reason: string, disposeTransport: boolean): void {
    if (this.closed) return;
    this.closed = true; this.messageSub.dispose(); this.closeSub.dispose();
    if (disposeTransport) this.transport.dispose();
    for (const pending of this.pending.values()) { clearTimeout(pending.timeout); pending.reject(new Error(reason)); }
    this.pending.clear();
    for (const listener of this.closes) listener(reason);
    this.closes.clear(); this.notifications.clear(); this.requests.clear();
  }
}

class Bootstrap {
  private nextId = 1;
  private readonly pending = new Map<JsonRpcId, Pending>();
  private readonly messageSub: RuntimeDisposable;
  private readonly closeSub: RuntimeDisposable;
  private detached = false;
  constructor(private readonly transport: CodexMessageTransport) {
    this.messageSub = transport.onMessage((message) => this.handle(message));
    this.closeSub = transport.onClose((reason) => this.rejectAll(reason));
  }
  async initialize(timeoutMs: number): Promise<CodexInitializeResult> {
    const result = await this.request('initialize', { clientInfo: { name: 'pets_council', title: 'Pets Council', version: '0.8.0' }, capabilities: {} }, timeoutMs);
    const info = parseInitialize(result); this.transport.send({ method: 'initialized' }); return info;
  }
  detach(): void { this.detached = true; this.messageSub.dispose(); this.closeSub.dispose(); }
  dispose(): void { if (!this.detached) { this.messageSub.dispose(); this.closeSub.dispose(); this.rejectAll('Initialization cancelled.'); this.transport.dispose(); } }
  private request(method: string, params: unknown, timeoutMs: number): Promise<unknown> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => { const timeout = setTimeout(() => { this.pending.delete(id); reject(new Error(`Codex app-server request timed out: ${method}`)); }, timeoutMs); this.pending.set(id, { resolve, reject, timeout }); this.transport.send({ id, method, params }); });
  }
  private handle(message: unknown): void { if (!isResponse(message)) return; const pending = this.pending.get(message.id); if (!pending) return; this.pending.delete(message.id); clearTimeout(pending.timeout); if (message.error) pending.reject(new Error(message.error.message)); else pending.resolve(message.result); }
  private rejectAll(reason: string): void { for (const pending of this.pending.values()) { clearTimeout(pending.timeout); pending.reject(new Error(reason)); } this.pending.clear(); }
}

function parseInitialize(value: unknown): CodexInitializeResult { const v = object(value,'initialize result'); return { userAgent: optional(v.userAgent), codexHome: optional(v.codexHome), platformFamily: optional(v.platformFamily), platformOs: optional(v.platformOs) }; }
function parseThread(value: unknown): CodexThreadInfo { const response=object(value,'thread/start result');const thread=object(response.thread,'thread');return { id: required(thread.id,'thread.id'), sessionId: optional(thread.sessionId), preview: optional(thread.preview), cwd: optional(response.cwd)??optional(thread.cwd), model: optional(response.model), modelProvider: optional(response.modelProvider)??optional(thread.modelProvider), approvalPolicy: stringLike(response.approvalPolicy), approvalsReviewer: stringLike(response.approvalsReviewer) }; }
function parseTurnId(value: unknown): string { const response=object(value,'turn/start result');const turn=object(response.turn,'turn');return required(turn.id,'turn.id'); }
function object(value: unknown,label:string):Record<string,unknown>{if(typeof value!=='object'||value===null)throw new Error(`Codex app-server returned an invalid ${label}.`);return value as Record<string,unknown>;}
function required(value:unknown,label:string):string{const result=optional(value);if(!result)throw new Error(`Codex app-server returned an invalid ${label}.`);return result;}
function optional(value:unknown):string|undefined{return typeof value==='string'&&value.trim()?value:undefined;}
function stringLike(value:unknown):string|undefined{return typeof value==='string'?value:value==null?undefined:JSON.stringify(value);}
function isServerRequest(value:unknown):value is JsonRpcServerRequest{if(typeof value!=='object'||value===null)return false;const v=value as Record<string,unknown>;return (typeof v.id==='number'||typeof v.id==='string')&&typeof v.method==='string';}
function isResponse(value:unknown):value is JsonRpcResponse{if(typeof value!=='object'||value===null)return false;const v=value as Record<string,unknown>;return (typeof v.id==='number'||typeof v.id==='string')&&typeof v.method!=='string';}
function isNotification(value:unknown):value is JsonRpcNotification{if(typeof value!=='object'||value===null)return false;const v=value as Record<string,unknown>;return typeof v.method==='string'&&v.id===undefined;}
function disposable(dispose:()=>void):RuntimeDisposable{return{dispose};}

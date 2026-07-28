import type {
  CodexInitializeResult, CodexMessageTransport, CodexRestoredTurn, CodexThreadInfo,
  CodexTransportFactory, JsonRpcId, JsonRpcNotification, JsonRpcResponse,
  JsonRpcServerRequest, RuntimeDisposable
} from './types';
import {
  buildThreadModelParams, buildTurnEffortParams, DEFAULT_CODEX_EFFORT, DEFAULT_CODEX_MODEL,
  normalizeModelList, readConfigSelection, type CodexModelDescriptor, type CodexModelSelection
} from './modelSelection';

type Pending = Readonly<{ resolve(value: unknown): void; reject(error: Error): void; timeout: NodeJS.Timeout }>;
const REQUEST_TIMEOUT_MS = 5_000;
const MODEL_CATALOG_TIMEOUT_MS = 15_000;
const COUNCIL_TIMEOUT_MS = 45_000;

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

  static async connect(factory: CodexTransportFactory, binary: string, timeoutMs = REQUEST_TIMEOUT_MS): Promise<CodexAppServerClient> {
    const transport = await factory(binary);
    const bootstrap = new Bootstrap(transport);
    try { const info = await bootstrap.initialize(timeoutMs); bootstrap.detach(); return new CodexAppServerClient(transport, info); }
    catch (error) { bootstrap.dispose(); throw error; }
  }

  request<T = unknown>(method: string, params?: unknown, timeoutMs = REQUEST_TIMEOUT_MS): Promise<T> {
    if (this.closed) return Promise.reject(new Error('Codex app-server connection is closed.'));
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => { this.pending.delete(id); reject(new Error(`Codex app-server request timed out: ${method}`)); }, timeoutMs);
      this.pending.set(id, { resolve: (value) => resolve(value as T), reject, timeout });
      this.transport.send({ id, method, ...(params === undefined ? {} : { params }) });
    });
  }

  async startThread(cwd?: string, selection?: CodexModelSelection): Promise<CodexThreadInfo> {
    return parseThread(await this.request('thread/start', { ...(cwd ? { cwd } : {}), approvalsReviewer: 'user', ...buildThreadModelParams(selection) }));
  }
  async resumeThread(threadId: string, cwd?: string, selection?: CodexModelSelection): Promise<CodexThreadInfo> {
    return parseThread(await this.request('thread/resume', { threadId, ...(cwd ? { cwd } : {}), approvalsReviewer: 'user', ...buildThreadModelParams(selection) }));
  }
  async startTurn(threadId: string, text: string, cwd?: string, selection?: CodexModelSelection): Promise<string> {
    return parseTurnId(await this.request('turn/start', {
      threadId,
      input: [{ type: 'text', text }],
      ...(cwd ? { cwd } : {}),
      approvalsReviewer: 'user',
      ...buildTurnEffortParams(selection)
    }));
  }
  async listModels(): Promise<CodexModelDescriptor[]> {
    const models: CodexModelDescriptor[] = [];
    let cursor: string | null = null;
    try {
      for (let page = 0; page < 10; page++) {
        const response = await this.request<unknown>('model/list', { cursor, limit: 100 }, MODEL_CATALOG_TIMEOUT_MS);
        models.push(...normalizeModelList(response));
        const nextCursor = optional(objectOptional(response)?.nextCursor);
        if (!nextCursor || nextCursor === cursor) break;
        cursor = nextCursor;
      }
    } catch {
      // A missing or slow catalog must not remove the model controls from the product.
    }
    const unique = dedupeModels(models);
    return unique.length ? unique : [fallbackModelDescriptor()];
  }
  async readConfig(): Promise<Partial<CodexModelSelection>> {
    try {
      const response = await this.request<unknown>('config/read', {}, MODEL_CATALOG_TIMEOUT_MS);
      const root = objectOptional(response);
      return readConfigSelection(root?.config ?? response);
    } catch {
      // Config is optional for the picker; the server catalog and product defaults remain usable.
      return {};
    }
  }

  async runCouncilReview(prompt: string, outputSchema: unknown, cwd?: string, selection?: CodexModelSelection, timeoutMs = COUNCIL_TIMEOUT_MS): Promise<string> {
    const thread = parseThread(await this.request('thread/start', {
      ...(cwd ? { cwd } : {}),approvalPolicy: 'never', approvalsReviewer: 'user', sandbox: 'read-only', ephemeral: true,
      serviceName: 'pets-council-review',
      ...buildThreadModelParams(selection),
      developerInstructions: 'You are the consultative Pets Council review runtime. Do not run commands, modify files, request permissions, or start subagents. Return only the JSON object required by the provided output schema.'
    }, timeoutMs));
    return this.runStructuredTurn(thread.id, prompt, outputSchema, cwd, selection, timeoutMs);
  }

  async interruptTurn(threadId: string, turnId: string): Promise<void> {await this.request('turn/interrupt', { threadId, turnId });}
  respond(requestId: JsonRpcId, result: unknown): void {if (this.closed) throw new Error('Codex app-server connection is closed.');this.transport.send({ id: requestId, result });}
  onNotification(listener: (value: JsonRpcNotification) => void): RuntimeDisposable { this.notifications.add(listener); return disposable(() => this.notifications.delete(listener)); }
  onRequest(listener: (value: JsonRpcServerRequest) => void): RuntimeDisposable { this.requests.add(listener); return disposable(() => this.requests.delete(listener)); }
  onDidClose(listener: (reason: string) => void): RuntimeDisposable { this.closes.add(listener); return disposable(() => this.closes.delete(listener)); }
  dispose(): void { this.close('Disconnected by Pets Council.', true); }

  private runStructuredTurn(threadId: string, prompt: string, outputSchema: unknown, cwd: string | undefined, selection: CodexModelSelection | undefined, timeoutMs: number): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      let turnId: string | undefined,assistantText = '',settled = false,timeout: NodeJS.Timeout;
      const cleanup=():void=>{clearTimeout(timeout);subscription.dispose();};
      const fail=(error:unknown):void=>{if(settled)return;settled=true;cleanup();reject(error instanceof Error?error:new Error(String(error)));};
      const succeed=():void=>{if(settled)return;settled=true;cleanup();const result=assistantText.trim();if(!result)reject(new Error('The structured Council review completed without an assistant message.'));else resolve(result);};
      const subscription=this.onNotification((notification)=>{
        const params=objectOptional(notification.params);if(!params||optional(params.threadId)!==threadId)return;
        if(notification.method==='turn/started'){turnId=optional(objectOptional(params.turn)?.id)??turnId;return;}
        const eventTurnId=optional(params.turnId)??optional(objectOptional(params.turn)?.id);if(turnId&&eventTurnId&&turnId!==eventTurnId)return;
        if(notification.method==='item/agentMessage/delta')assistantText+=typeof params.delta==='string'?params.delta:'';
        else if(notification.method==='item/completed'){const item=objectOptional(params.item);if(item?.type==='agentMessage'&&typeof item.text==='string')assistantText=item.text;}
        else if(notification.method==='turn/completed'){const turn=objectOptional(params.turn),error=objectOptional(turn?.error);if(optional(turn?.status)==='failed'||error)fail(new Error(optional(error?.message)??'The structured Council review failed.'));else succeed();}
      });
      timeout=setTimeout(()=>fail(new Error('The structured Council review timed out.')),timeoutMs);
      void this.request('turn/start',{threadId,input:[{type:'text',text:prompt}],...(cwd?{cwd}:{}),approvalPolicy:'never',approvalsReviewer:'user',outputSchema,...buildTurnEffortParams(selection)},timeoutMs).then((result)=>{turnId=parseTurnId(result);},fail);
    });
  }

  private handle(message: unknown): void {
    if (isServerRequest(message)) { for (const listener of this.requests) listener(message); return; }
    if (isResponse(message)) {const pending=this.pending.get(message.id);if(!pending)return;this.pending.delete(message.id);clearTimeout(pending.timeout);if(message.error)pending.reject(new Error(`Codex app-server error ${message.error.code}: ${message.error.message}`));else pending.resolve(message.result);return;}
    if (isNotification(message)) for (const listener of this.notifications) listener(message);
  }
  private close(reason: string, disposeTransport: boolean): void {if(this.closed)return;this.closed=true;this.messageSub.dispose();this.closeSub.dispose();if(disposeTransport)this.transport.dispose();for(const pending of this.pending.values()){clearTimeout(pending.timeout);pending.reject(new Error(reason));}this.pending.clear();for(const listener of this.closes)listener(reason);this.closes.clear();this.notifications.clear();this.requests.clear();}
}

class Bootstrap {
  private nextId=1;private readonly pending=new Map<JsonRpcId,Pending>();private readonly messageSub:RuntimeDisposable;private readonly closeSub:RuntimeDisposable;private detached=false;
  constructor(private readonly transport:CodexMessageTransport){this.messageSub=transport.onMessage((message)=>this.handle(message));this.closeSub=transport.onClose((reason)=>this.rejectAll(reason));}
  async initialize(timeoutMs:number):Promise<CodexInitializeResult>{const result=await this.request('initialize',{clientInfo:{name:'pets_council',title:'Pets Council',version:'0.11.0'},capabilities:{}},timeoutMs);const info=parseInitialize(result);this.transport.send({method:'initialized'});return info;}
  detach():void{this.detached=true;this.messageSub.dispose();this.closeSub.dispose();}
  dispose():void{if(!this.detached){this.messageSub.dispose();this.closeSub.dispose();this.rejectAll('Initialization cancelled.');this.transport.dispose();}}
  private request(method:string,params:unknown,timeoutMs:number):Promise<unknown>{const id=this.nextId++;return new Promise((resolve,reject)=>{const timeout=setTimeout(()=>{this.pending.delete(id);reject(new Error(`Codex app-server request timed out: ${method}`));},timeoutMs);this.pending.set(id,{resolve,reject,timeout});this.transport.send({id,method,params});});}
  private handle(message:unknown):void{if(!isResponse(message))return;const pending=this.pending.get(message.id);if(!pending)return;this.pending.delete(message.id);clearTimeout(pending.timeout);if(message.error)pending.reject(new Error(message.error.message));else pending.resolve(message.result);}
  private rejectAll(reason:string):void{for(const pending of this.pending.values()){clearTimeout(pending.timeout);pending.reject(new Error(reason));}this.pending.clear();}
}

function fallbackModelDescriptor():CodexModelDescriptor{return{id:DEFAULT_CODEX_MODEL,model:DEFAULT_CODEX_MODEL,displayName:DEFAULT_CODEX_MODEL.toUpperCase(),isDefault:true,supportedReasoningEfforts:[DEFAULT_CODEX_EFFORT],defaultReasoningEffort:DEFAULT_CODEX_EFFORT};}
function dedupeModels(models:readonly CodexModelDescriptor[]):CodexModelDescriptor[]{const seen=new Set<string>();return models.filter((model)=>{if(seen.has(model.model))return false;seen.add(model.model);return true;});}
function parseInitialize(value:unknown):CodexInitializeResult{const v=object(value,'initialize result');return{userAgent:optional(v.userAgent),codexHome:optional(v.codexHome),platformFamily:optional(v.platformFamily),platformOs:optional(v.platformOs)};}
export function parseThread(value:unknown):CodexThreadInfo{const response=object(value,'thread response'),thread=object(response.thread,'thread'),completedTurns=extractCompletedTurns(thread.turns);return{id:required(thread.id,'thread.id'),sessionId:optional(thread.sessionId),preview:optional(thread.preview),cwd:optional(response.cwd)??optional(thread.cwd),model:optional(response.model),modelProvider:optional(response.modelProvider)??optional(thread.modelProvider),reasoningEffort:optional(response.reasoningEffort)??optional(thread.reasoningEffort),approvalPolicy:stringLike(response.approvalPolicy),approvalsReviewer:stringLike(response.approvalsReviewer),completedTurns,lastCompletedTurn:completedTurns.at(-1)};}
function extractCompletedTurns(value:unknown):CodexRestoredTurn[]{if(!Array.isArray(value))return[];return value.flatMap((raw)=>{const turn=objectOptional(raw);if(!turn||optional(turn.status)!=='completed')return[];const items=Array.isArray(turn.items)?turn.items:[];let user='',assistant='';for(const itemRaw of items){const item=objectOptional(itemRaw);if(!item)continue;if(item.type==='userMessage'&&Array.isArray(item.content)){user=item.content.map(input=>{const entry=objectOptional(input);return entry?.type==='text'&&typeof entry.text==='string'?entry.text:'';}).filter(Boolean).join('\n');}if(item.type==='agentMessage'&&typeof item.text==='string')assistant=item.text;}const id=optional(turn.id);return id&&user.trim()&&assistant.trim()?[{turnId:id,userMessage:user.trim(),assistantMessage:assistant.trim(),startedAt:numberValue(turn.startedAt),completedAt:numberValue(turn.completedAt)}]:[];});}
function parseTurnId(value:unknown):string{const response=object(value,'turn/start result'),turn=object(response.turn,'turn');return required(turn.id,'turn.id');}
function object(value:unknown,label:string):Record<string,unknown>{if(typeof value!=='object'||value===null)throw new Error(`Codex app-server returned an invalid ${label}.`);return value as Record<string,unknown>;}
function objectOptional(value:unknown):Record<string,unknown>|undefined{return typeof value==='object'&&value!==null?value as Record<string,unknown>:undefined;}
function required(value:unknown,label:string):string{const result=optional(value);if(!result)throw new Error(`Codex app-server returned an invalid ${label}.`);return result;}
function optional(value:unknown):string|undefined{return typeof value==='string'&&value.trim()?value:undefined;}
function numberValue(value:unknown):number|undefined{return typeof value==='number'&&Number.isFinite(value)?value:undefined;}
function stringLike(value:unknown):string|undefined{return typeof value==='string'?value:value==null?undefined:JSON.stringify(value);}
function isServerRequest(value:unknown):value is JsonRpcServerRequest{if(typeof value!=='object'||value===null)return false;const v=value as Record<string,unknown>;return(typeof v.id==='number'||typeof v.id==='string')&&typeof v.method==='string';}
function isResponse(value:unknown):value is JsonRpcResponse{if(typeof value!=='object'||value===null)return false;const v=value as Record<string,unknown>;return(typeof v.id==='number'||typeof v.id==='string')&&typeof v.method!=='string';}
function isNotification(value:unknown):value is JsonRpcNotification{if(typeof value!=='object'||value===null)return false;const v=value as Record<string,unknown>;return typeof v.method==='string'&&v.id===undefined;}
function disposable(dispose:()=>void):RuntimeDisposable{return{dispose};}

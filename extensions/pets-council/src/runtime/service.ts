import { CodexAppServerClient } from './client';
import type {
  CodexApprovalDecision, CodexApprovalRequest, CodexResumeCandidate, CodexRuntimeStatus,
  CodexThreadStatus, CodexTransportFactory, CodexTurnStatus, JsonRpcNotification,
  JsonRpcServerRequest, RuntimeDisposable
} from './types';

export class CodexRuntimeService {
  private client: CodexAppServerClient | undefined;
  private closeSub: RuntimeDisposable | undefined;
  private notificationSub: RuntimeDisposable | undefined;
  private requestSub: RuntimeDisposable | undefined;
  private readonly listeners = new Set<(status: CodexRuntimeStatus) => void>();
  private connectionSequence = 0;
  private threadSequence = 0;
  private turnSequence = 0;
  private statusValue: CodexRuntimeStatus;

  constructor(binary: string, private readonly factory: CodexTransportFactory) {
    this.statusValue = disconnected(binary);
  }

  get status(): CodexRuntimeStatus { return this.statusValue; }

  setResumeCandidate(candidate: CodexResumeCandidate | undefined): void {
    if (candidate?.threadId === this.statusValue.resumeCandidate?.threadId && candidate?.savedAt === this.statusValue.resumeCandidate?.savedAt) return;
    this.set({ ...this.statusValue, resumeCandidate: candidate });
  }

  setBinary(binary: string): void {
    const value = binary.trim() || 'codex';
    if (value === this.statusValue.binary) return;
    const candidate = this.statusValue.resumeCandidate;
    this.disconnect();
    this.set({ ...disconnected(value), resumeCandidate: candidate });
  }

  async connect(): Promise<void> {
    if (this.statusValue.phase === 'connecting' || this.statusValue.phase === 'ready') return;
    const sequence = ++this.connectionSequence;
    const binary = this.statusValue.binary;
    const resumeCandidate = this.statusValue.resumeCandidate;
    this.set({ phase:'connecting',binary,message:'Starting codex app-server and negotiating the initialize handshake…',thread:noThread(),turn:idleTurn(),resumeCandidate });
    try {
      const client = await CodexAppServerClient.connect(this.factory, binary);
      if (sequence !== this.connectionSequence) { client.dispose(); return; }
      this.replaceClient(client);
      this.set({ phase:'ready',binary,message:'Connected. Choose whether to start a new session or resume the saved one.',server:client.serverInfo,thread:noThread(),turn:idleTurn(),resumeCandidate });
    } catch (error) {
      if (sequence !== this.connectionSequence) return;
      this.replaceClient(undefined);
      this.set({ phase:'error',binary,message:normalize(error),thread:noThread(),turn:idleTurn(),resumeCandidate });
    }
  }

  async startThread(cwd?: string): Promise<void> {
    const client = this.readyClient();
    if (!client || this.statusValue.thread.phase === 'starting' || running(this.statusValue.turn)) return;
    const sequence = ++this.threadSequence; ++this.turnSequence;
    this.set({ ...this.statusValue,thread:{phase:'starting',message:'Creating a new Codex thread for this workspace…'},turn:idleTurn(),approval:undefined });
    try {
      const thread = await client.startThread(cwd);
      if (!this.isCurrentThreadOperation(client, sequence)) return;
      this.set({ ...this.statusValue,thread:{phase:'ready',message:'New thread ready. No turn has been started and no prompt has been sent.',thread},turn:idleTurn(),approval:undefined,resumeCandidate:{threadId:thread.id,savedAt:Date.now()} });
    } catch (error) {
      if (sequence === this.threadSequence && this.client === client) this.setThread({phase:'error',message:normalize(error)});
    }
  }

  async resumeThread(threadId?: string, cwd?: string): Promise<void> {
    const client = this.readyClient();
    if (!client || this.statusValue.thread.phase === 'starting' || running(this.statusValue.turn)) return;
    const candidate = threadId ?? this.statusValue.resumeCandidate?.threadId;
    if (!candidate) { this.setThread({phase:'error',message:'No saved Codex session is available for this workspace.'}); return; }
    const sequence = ++this.threadSequence; ++this.turnSequence;
    this.set({ ...this.statusValue,thread:{phase:'starting',message:'Resuming the saved Codex thread…'},turn:idleTurn(),approval:undefined });
    try {
      const thread = await client.resumeThread(candidate, cwd);
      if (!this.isCurrentThreadOperation(client, sequence)) return;
      const restored = thread.lastCompletedTurn;
      this.set({
        ...this.statusValue,
        thread:{phase:'ready',message:restored?'Saved thread resumed with its last completed exchange.':'Saved thread resumed. No completed text exchange was available to restore.',thread},
        turn:restored?{phase:'completed',message:'Restored the last completed turn from this Codex session.',turnId:restored.turnId,userMessage:restored.userMessage,assistantMessage:restored.assistantMessage,startedAt:restored.startedAt,completedAt:restored.completedAt}:idleTurn(),
        approval:undefined,
        resumeCandidate:{threadId:thread.id,savedAt:this.statusValue.resumeCandidate?.savedAt??Date.now()}
      });
    } catch (error) {
      if (sequence === this.threadSequence && this.client === client) this.setThread({phase:'error',message:normalize(error)});
    }
  }

  async startTurn(userMessage: string, cwd?: string): Promise<void> {
    const text = userMessage.trim();
    if (!text) { this.setTurn({phase:'error',message:'Write a prompt before starting a Codex turn.'}); return; }
    const client = this.readyClient();
    const thread = this.statusValue.thread.thread;
    if (!client || this.statusValue.thread.phase !== 'ready' || !thread) {
      this.setTurn({phase:'error',message:'Start or resume a Codex session before sending a prompt.',userMessage:text}); return;
    }
    if (running(this.statusValue.turn) || this.statusValue.approval) return;
    const sequence = ++this.turnSequence;
    this.set({ ...this.statusValue,turn:{phase:'starting',message:'Sending the prompt to Codex…',userMessage:text,assistantMessage:''},approval:undefined });
    try {
      const turnId = await client.startTurn(thread.id, text, cwd);
      if (sequence !== this.turnSequence || this.client !== client || this.statusValue.phase !== 'ready') return;
      const current = this.statusValue.turn;
      if (current.turnId === turnId && (current.phase === 'completed' || current.phase === 'error')) return;
      this.setTurn({ ...current,phase:'streaming',message:'Codex is responding…',turnId,userMessage:text,assistantMessage:current.assistantMessage??'' });
    } catch (error) {
      if (sequence === this.turnSequence && this.client === client) this.setTurn({phase:'error',message:normalize(error),userMessage:text,assistantMessage:this.statusValue.turn.assistantMessage});
    }
  }

  async runCouncilReview(prompt: string, outputSchema: unknown, cwd?: string): Promise<string> {
    if (this.statusValue.phase !== 'ready' || !this.client) throw new Error('Connect Codex before requesting an intelligent Council review.');
    if (running(this.statusValue.turn)) throw new Error('Wait for the primary Codex turn to complete before the Council reviews it.');
    if (this.statusValue.approval) throw new Error('Resolve the pending approval before the Council review starts.');
    return this.client.runCouncilReview(prompt, outputSchema, cwd);
  }

  async interruptTurn(): Promise<void> {
    const client=this.client,threadId=this.statusValue.thread.thread?.id,turnId=this.statusValue.turn.turnId;
    if(!client||!threadId||!turnId||!running(this.statusValue.turn))return;
    if(this.statusValue.approval)this.respondApproval('decline');
    this.setTurn({...this.statusValue.turn,message:'Interrupting the Codex turn…'});
    try{await client.interruptTurn(threadId,turnId);}catch(error){this.setTurn({...this.statusValue.turn,phase:'error',message:normalize(error)});}
  }

  respondApproval(decision: CodexApprovalDecision): void {
    const approval=this.statusValue.approval;if(!approval||!this.client)return;
    this.client.respond(approval.requestId,{decision});
    this.set({...this.statusValue,approval:undefined,turn:{...this.statusValue.turn,message:decision==='accept'?'Approval granted. Codex is continuing…':'Approval declined. Waiting for Codex…'}});
  }

  disconnect(): void {
    ++this.connectionSequence;++this.threadSequence;++this.turnSequence;
    const binary=this.statusValue.binary,resumeCandidate=this.statusValue.resumeCandidate;
    this.replaceClient(undefined);this.set({...disconnected(binary),resumeCandidate});
  }
  onDidChange(listener:(status:CodexRuntimeStatus)=>void):RuntimeDisposable{this.listeners.add(listener);return disposable(()=>this.listeners.delete(listener));}
  dispose():void{++this.connectionSequence;++this.threadSequence;++this.turnSequence;this.replaceClient(undefined);this.listeners.clear();}

  private readyClient():CodexAppServerClient|undefined{
    if(this.statusValue.phase!=='ready'||!this.client){this.setThread({phase:'error',message:'Connect Codex before choosing a session.'});return undefined;}
    return this.client;
  }
  private isCurrentThreadOperation(client:CodexAppServerClient,sequence:number):boolean{return sequence===this.threadSequence&&this.client===client&&this.statusValue.phase==='ready';}
  private replaceClient(client:CodexAppServerClient|undefined):void{
    this.closeSub?.dispose();this.notificationSub?.dispose();this.requestSub?.dispose();this.closeSub=this.notificationSub=this.requestSub=undefined;
    const previous=this.client;this.client=client;previous?.dispose();if(!client)return;
    this.closeSub=client.onDidClose((reason)=>{if(this.client!==client)return;this.client=undefined;this.closeSub?.dispose();this.notificationSub?.dispose();this.requestSub?.dispose();++this.threadSequence;++this.turnSequence;this.set({phase:'error',binary:this.statusValue.binary,message:reason,thread:noThread(),turn:idleTurn(),resumeCandidate:this.statusValue.resumeCandidate});});
    this.notificationSub=client.onNotification((value)=>{if(this.client===client)this.handleNotification(value);});
    this.requestSub=client.onRequest((value)=>{if(this.client===client)this.handleRequest(value);});
  }

  private handleRequest(request:JsonRpcServerRequest):void{
    if(request.method!=='item/commandExecution/requestApproval'&&request.method!=='item/fileChange/requestApproval')return;
    const params=objectValue(request.params),approval=params?parseApproval(request,params):undefined;if(!approval)return;
    const activeThread=this.statusValue.thread.thread?.id,activeTurn=this.statusValue.turn.turnId;
    if((activeThread&&approval.threadId!==activeThread)||(activeTurn&&approval.turnId!==activeTurn))return;
    this.set({...this.statusValue,approval,turn:{...this.statusValue.turn,message:'Codex is waiting for your approval.'}});
  }

  private handleNotification(notification:JsonRpcNotification):void{
    const params=objectValue(notification.params);if(!params)return;
    const activeThread=this.statusValue.thread.thread?.id,notificationThread=optionalString(params.threadId);if(activeThread&&notificationThread&&notificationThread!==activeThread)return;
    if(notification.method==='turn/started'){
      const turn=objectValue(params.turn),turnId=optionalString(turn?.id);if(!turnId)return;
      this.setTurn({...this.statusValue.turn,phase:'streaming',message:'Codex is responding…',turnId,startedAt:numberValue(turn?.startedAt)??Date.now()/1000,assistantMessage:this.statusValue.turn.assistantMessage??''});return;
    }
    if(notification.method==='item/agentMessage/delta'){
      const delta=optionalString(params.delta),turnId=optionalString(params.turnId);if(!delta||!matches(this.statusValue.turn,turnId))return;
      this.setTurn({...this.statusValue.turn,phase:'streaming',message:'Codex is responding…',turnId:this.statusValue.turn.turnId??turnId,assistantMessage:`${this.statusValue.turn.assistantMessage??''}${delta}`});return;
    }
    if(notification.method==='item/completed'){
      const turnId=optionalString(params.turnId);if(!matches(this.statusValue.turn,turnId))return;const item=objectValue(params.item);
      if(item?.type==='agentMessage'&&typeof item.text==='string')this.setTurn({...this.statusValue.turn,turnId:this.statusValue.turn.turnId??turnId,assistantMessage:item.text});return;
    }
    if(notification.method==='turn/completed'){
      const turn=objectValue(params.turn),turnId=optionalString(turn?.id)??optionalString(params.turnId);if(!matches(this.statusValue.turn,turnId))return;
      const failed=optionalString(turn?.status)==='failed'||Boolean(objectValue(turn?.error));
      this.set({...this.statusValue,approval:undefined,turn:{...this.statusValue.turn,phase:failed?'error':'completed',message:failed?optionalString(objectValue(turn?.error)?.message)??'The Codex turn failed.':'Codex completed the turn.',turnId:this.statusValue.turn.turnId??turnId,completedAt:numberValue(turn?.completedAt)??Date.now()/1000}});
    }
  }
  private setThread(thread:CodexThreadStatus):void{this.set({...this.statusValue,thread});}
  private setTurn(turn:CodexTurnStatus):void{this.set({...this.statusValue,turn});}
  private set(status:CodexRuntimeStatus):void{this.statusValue=status;for(const listener of this.listeners)listener(status);}
}

function parseApproval(request:JsonRpcServerRequest,params:Record<string,unknown>):CodexApprovalRequest|undefined{
  const threadId=optionalString(params.threadId),turnId=optionalString(params.turnId),itemId=optionalString(params.itemId);if(!threadId||!turnId||!itemId)return undefined;
  return{requestId:request.id,kind:request.method.includes('commandExecution')?'commandExecution':'fileChange',threadId,turnId,itemId,reason:optionalString(params.reason),command:optionalString(params.command),cwd:optionalString(params.cwd),grantRoot:optionalString(params.grantRoot),startedAtMs:numberValue(params.startedAtMs)};
}
export function resolveCodexBinary(configured:string|undefined,environment:NodeJS.ProcessEnv=process.env):string{return configured?.trim()||environment.CODEX_BIN?.trim()||'codex';}
function disconnected(binary:string):CodexRuntimeStatus{return{phase:'disconnected',binary,message:'Disconnected. Connecting is always an explicit user action.',thread:noThread(),turn:idleTurn()};}
function noThread():CodexThreadStatus{return{phase:'none',message:'No Codex thread exists for this runtime connection.'};}
function idleTurn():CodexTurnStatus{return{phase:'idle',message:'No Codex turn has been started in this session.'};}
function running(turn:CodexTurnStatus):boolean{return turn.phase==='starting'||turn.phase==='streaming';}
function matches(turn:CodexTurnStatus,id:string|undefined):boolean{return!turn.turnId||!id||turn.turnId===id;}
function objectValue(value:unknown):Record<string,unknown>|undefined{return typeof value==='object'&&value!==null?value as Record<string,unknown>:undefined;}
function optionalString(value:unknown):string|undefined{return typeof value==='string'&&value.trim()?value:undefined;}
function numberValue(value:unknown):number|undefined{return typeof value==='number'&&Number.isFinite(value)?value:undefined;}
function normalize(error:unknown):string{return error instanceof Error?error.message:String(error);}
function disposable(dispose:()=>void):RuntimeDisposable{return{dispose};}

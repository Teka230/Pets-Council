import assert from 'node:assert/strict';
import test from 'node:test';
import { CodexAppServerClient } from './client';
import type { CodexMessageTransport, RuntimeDisposable } from './types';

class FakeTransport implements CodexMessageTransport {
  readonly sent: unknown[] = [];
  private readonly messages = new Set<(message: unknown) => void>();
  private readonly closes = new Set<(reason: string) => void>();
  constructor(private readonly catalogFailure=false) {}
  send(message: unknown): void {
    this.sent.push(message);
    const request = message as { id?: number; method?: string; params?: Record<string, unknown> };
    if (request.method === 'initialize') this.reply({ id:request.id,result:{userAgent:'codex-test/1.0'} });
    if (request.method === 'model/list') this.reply(this.catalogFailure?{id:request.id,error:{code:-32000,message:'catalog unavailable'}}:{id:request.id,result:{data:[{id:'gpt-test',model:'gpt-test',displayName:'GPT Test',isDefault:true,supportedReasoningEfforts:['medium'],defaultReasoningEffort:'medium'}],nextCursor:null}});
    if (request.method === 'config/read') this.reply(this.catalogFailure?{id:request.id,error:{code:-32000,message:'config unavailable'}}:{id:request.id,result:{config:{model:'gpt-test',model_reasoning_effort:'medium'}}});
    if (request.method === 'thread/start') {
      const id=request.params?.ephemeral?'thread-review':'thread-new';
      this.reply({id:request.id,result:{thread:{id},approvalsReviewer:'user'}});
    }
    if (request.method === 'thread/resume') this.reply({id:request.id,result:{thread:{id:'thread-saved',turns:[{id:'turn-old',status:'completed',startedAt:100,completedAt:101,items:[{type:'userMessage',id:'user',content:[{type:'text',text:'What changed?',text_elements:[]}]},{type:'agentMessage',id:'agent',text:'The runtime now supports resume.',phase:null,memoryCitation:null}]}]},model:'gpt-test',modelProvider:'openai',cwd:'/workspace',approvalPolicy:'on-request',approvalsReviewer:'user'}});
    if (request.method === 'turn/start') {
      const review=request.params?.threadId==='thread-review',turnId=review?'turn-review':'turn-1';
      this.reply({id:request.id,result:{turn:{id:turnId}}});
      if(review)queueMicrotask(()=>{
        this.emit({method:'turn/started',params:{threadId:'thread-review',turn:{id:turnId}}});
        this.emit({method:'item/completed',params:{threadId:'thread-review',turnId,item:{type:'agentMessage',id:'item',text:'{"architect":[],"guardian":[],"strategist":[],"notetaker":[]}'}}});
        this.emit({method:'turn/completed',params:{threadId:'thread-review',turn:{id:turnId,status:'completed',error:null}}});
      });
    }
    if(request.method==='turn/interrupt')this.reply({id:request.id,result:{}});
  }
  onMessage(listener:(message:unknown)=>void):RuntimeDisposable{this.messages.add(listener);return{dispose:()=>this.messages.delete(listener)};}
  onClose(listener:(reason:string)=>void):RuntimeDisposable{this.closes.add(listener);return{dispose:()=>this.closes.delete(listener)};}
  dispose():void{this.messages.clear();this.closes.clear();}
  emit(message:unknown):void{for(const listener of this.messages)listener(message);}
  private reply(message:unknown):void{queueMicrotask(()=>this.emit(message));}
}

test('performs the current initialize handshake',async()=>{const transport=new FakeTransport();const client=await CodexAppServerClient.connect(async()=>transport,'codex',100);assert.deepEqual(transport.sent.slice(0,2),[{id:1,method:'initialize',params:{clientInfo:{name:'pets_council',title:'Pets Council',version:'0.11.0'},capabilities:{}}},{method:'initialized'}]);client.dispose();});
test('loads the paginated model catalog and nested effective config',async()=>{const transport=new FakeTransport();const client=await CodexAppServerClient.connect(async()=>transport,'codex',100);const [models,config]=await Promise.all([client.listModels(),client.readConfig()]);assert.equal(models[0]?.model,'gpt-test');assert.deepEqual(config,{model:'gpt-test',effort:'medium'});assert.deepEqual(transport.sent[2],{id:1,method:'model/list',params:{cursor:null,limit:100}});assert.deepEqual(transport.sent[3],{id:2,method:'config/read',params:{}});client.dispose();});
test('keeps a visible product-default model when catalog endpoints fail',async()=>{const transport=new FakeTransport(true);const client=await CodexAppServerClient.connect(async()=>transport,'codex',100);const [models,config]=await Promise.all([client.listModels(),client.readConfig()]);assert.equal(models[0]?.model,'gpt-5.5');assert.deepEqual(models[0]?.supportedReasoningEfforts,['medium']);assert.deepEqual(config,{});client.dispose();});
test('resumes a thread and restores completed text',async()=>{const transport=new FakeTransport();const client=await CodexAppServerClient.connect(async()=>transport,'codex',100);const thread=await client.resumeThread('thread-saved','/workspace');assert.equal(thread.lastCompletedTurn?.assistantMessage,'The runtime now supports resume.');client.dispose();});
test('runs Council review in an ephemeral read-only thread with no approvals',async()=>{const transport=new FakeTransport();const client=await CodexAppServerClient.connect(async()=>transport,'codex',100);const result=await client.runCouncilReview('Review this',{type:'object'},'/workspace',{model:'gpt-test',effort:'medium'},1000);assert.match(result,/architect/);assert.deepEqual(transport.sent[2],{id:1,method:'thread/start',params:{cwd:'/workspace',approvalPolicy:'never',approvalsReviewer:'user',sandbox:'read-only',ephemeral:true,serviceName:'pets-council-review',model:'gpt-test',developerInstructions:'You are the consultative Pets Council review runtime. Do not run commands, modify files, request permissions, or start subagents. Return only the JSON object required by the provided output schema.'}});client.dispose();});
test('starts text turns with effort overrides',async()=>{const transport=new FakeTransport();const client=await CodexAppServerClient.connect(async()=>transport,'codex',100);assert.equal(await client.startTurn('thread-1','Explain','/workspace',{model:'gpt-test',effort:'high'}),'turn-1');assert.deepEqual(transport.sent.at(-1),{id:1,method:'turn/start',params:{threadId:'thread-1',input:[{type:'text',text:'Explain'}],cwd:'/workspace',approvalsReviewer:'user',effort:'high'}});client.dispose();});
test('starts text turns, interrupts, and handles approval responses',async()=>{const transport=new FakeTransport();const client=await CodexAppServerClient.connect(async()=>transport,'codex',100);assert.equal(await client.startTurn('thread-1','Explain','/workspace'),'turn-1');await client.interruptTurn('thread-1','turn-1');client.respond('approval-1',{decision:'accept'});assert.deepEqual(transport.sent.at(-1),{id:'approval-1',result:{decision:'accept'}});client.dispose();});
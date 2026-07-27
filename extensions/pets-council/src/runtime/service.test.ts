import assert from 'node:assert/strict';
import test from 'node:test';
import { CodexRuntimeService } from './service';
import type { CodexMessageTransport, RuntimeDisposable } from './types';

class TestTransport implements CodexMessageTransport {
  readonly sent: unknown[]=[];
  private readonly messages=new Set<(message:unknown)=>void>();
  private readonly closes=new Set<(reason:string)=>void>();
  constructor(private readonly autoComplete=true){}
  send(message:unknown):void{
    this.sent.push(message);const request=message as{id?:number;method?:string};
    if(request.method==='initialize')this.reply({id:request.id,result:{userAgent:'codex-test'}});
    if(request.method==='thread/start')this.reply({id:request.id,result:{thread:{id:'thread-1'},approvalsReviewer:'user'}});
    if(request.method==='turn/start'){
      this.reply({id:request.id,result:{turn:{id:'turn-1'}}});
      queueMicrotask(()=>{
        this.emit({method:'turn/started',params:{threadId:'thread-1',turn:{id:'turn-1',startedAt:100}}});
        if(this.autoComplete){this.emit({method:'item/completed',params:{threadId:'thread-1',turnId:'turn-1',item:{type:'agentMessage',id:'item-1',text:'Hello world'}}});this.emit({method:'turn/completed',params:{threadId:'thread-1',turn:{id:'turn-1',status:'completed',error:null,completedAt:101}}});}
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

async function ready(autoComplete=true):Promise<{service:CodexRuntimeService;transport:TestTransport}>{const transport=new TestTransport(autoComplete);const service=new CodexRuntimeService('codex',async()=>transport);await service.connect();await service.startThread('/workspace');return{service,transport};}

test('streams and completes a normal assistant response',async()=>{const{service}=await ready();await service.startTurn('Hello');await new Promise(resolve=>setImmediate(resolve));assert.equal(service.status.turn.phase,'completed');assert.equal(service.status.turn.assistantMessage,'Hello world');service.dispose();});

test('surfaces command approvals and sends allow once',async()=>{const{service,transport}=await ready(false);await service.startTurn('Run tests');await new Promise(resolve=>setImmediate(resolve));transport.emit({id:'approval-1',method:'item/commandExecution/requestApproval',params:{threadId:'thread-1',turnId:'turn-1',itemId:'item-1',startedAtMs:1,command:'npm test',cwd:'/workspace',reason:'Run the test suite'}});assert.equal(service.status.approval?.kind,'commandExecution');assert.equal(service.status.approval?.command,'npm test');service.respondApproval('accept');assert.deepEqual(transport.sent.at(-1),{id:'approval-1',result:{decision:'accept'}});assert.equal(service.status.approval,undefined);service.dispose();});

test('surfaces file change approvals and sends decline',async()=>{const{service,transport}=await ready(false);await service.startTurn('Edit file');await new Promise(resolve=>setImmediate(resolve));transport.emit({id:2,method:'item/fileChange/requestApproval',params:{threadId:'thread-1',turnId:'turn-1',itemId:'item-2',startedAtMs:2,grantRoot:'/workspace/src'}});assert.equal(service.status.approval?.kind,'fileChange');service.respondApproval('decline');assert.deepEqual(transport.sent.at(-1),{id:2,result:{decision:'decline'}});service.dispose();});

test('interrupts an active turn explicitly',async()=>{const{service,transport}=await ready(false);await service.startTurn('Long task');await new Promise(resolve=>setImmediate(resolve));await service.interruptTurn();assert.deepEqual(transport.sent.at(-1),{id:3,method:'turn/interrupt',params:{threadId:'thread-1',turnId:'turn-1'}});assert.match(service.status.turn.message,/Interrupting/);service.dispose();});

test('interrupt declines a pending approval before stopping',async()=>{const{service,transport}=await ready(false);await service.startTurn('Command');await new Promise(resolve=>setImmediate(resolve));transport.emit({id:'approval-2',method:'item/commandExecution/requestApproval',params:{threadId:'thread-1',turnId:'turn-1',itemId:'item',startedAtMs:1,command:'rm temp'}});await service.interruptTurn();assert.deepEqual(transport.sent.slice(-2),[{id:'approval-2',result:{decision:'decline'}},{id:3,method:'turn/interrupt',params:{threadId:'thread-1',turnId:'turn-1'}}]);service.dispose();});

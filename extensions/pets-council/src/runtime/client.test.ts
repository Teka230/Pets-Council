import assert from 'node:assert/strict';
import test from 'node:test';
import { CodexAppServerClient } from './client';
import type { CodexMessageTransport, RuntimeDisposable } from './types';

class FakeTransport implements CodexMessageTransport {
  readonly sent: unknown[] = [];
  private readonly messages = new Set<(message: unknown) => void>();
  private readonly closes = new Set<(reason: string) => void>();
  send(message: unknown): void {
    this.sent.push(message);
    const request = message as { id?: number; method?: string };
    if (request.method === 'initialize') this.reply({ id: request.id, result: { userAgent: 'codex-test/1.0' } });
    if (request.method === 'thread/start') this.reply({ id: request.id, result: { thread: { id: 'thread-1' }, approvalsReviewer: 'user' } });
    if (request.method === 'turn/start') this.reply({ id: request.id, result: { turn: { id: 'turn-1' } } });
    if (request.method === 'turn/interrupt') this.reply({ id: request.id, result: {} });
  }
  onMessage(listener:(message:unknown)=>void):RuntimeDisposable{this.messages.add(listener);return{dispose:()=>this.messages.delete(listener)};}
  onClose(listener:(reason:string)=>void):RuntimeDisposable{this.closes.add(listener);return{dispose:()=>this.closes.delete(listener)};}
  dispose():void{this.messages.clear();this.closes.clear();}
  emit(message:unknown):void{for(const listener of this.messages)listener(message);}
  private reply(message:unknown):void{queueMicrotask(()=>this.emit(message));}
}

test('performs the current initialize handshake', async () => {
  const transport=new FakeTransport();const client=await CodexAppServerClient.connect(async()=>transport,'codex',100);
  assert.deepEqual(transport.sent.slice(0,2),[
    {id:1,method:'initialize',params:{clientInfo:{name:'pets_council',title:'Pets Council',version:'0.8.0'},capabilities:{}}},
    {method:'initialized'}
  ]);
  client.dispose();
});

test('starts text turns and interrupts explicitly', async () => {
  const transport=new FakeTransport();const client=await CodexAppServerClient.connect(async()=>transport,'codex',100);
  assert.equal(await client.startTurn('thread-1','Explain','/workspace'),'turn-1');
  await client.interruptTurn('thread-1','turn-1');
  assert.deepEqual(transport.sent[3],{id:2,method:'turn/interrupt',params:{threadId:'thread-1',turnId:'turn-1'}});
  client.dispose();
});

test('routes server requests and sends explicit approval results', async () => {
  const transport=new FakeTransport();const client=await CodexAppServerClient.connect(async()=>transport,'codex',100);
  const requests:unknown[]=[];client.onRequest(request=>requests.push(request));
  transport.emit({id:'approval-1',method:'item/commandExecution/requestApproval',params:{threadId:'thread-1',turnId:'turn-1',itemId:'item-1',command:'npm test',startedAtMs:1}});
  assert.equal(requests.length,1);
  client.respond('approval-1',{decision:'accept'});
  assert.deepEqual(transport.sent.at(-1),{id:'approval-1',result:{decision:'accept'}});
  client.dispose();
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { parseUsageSignalLine } from './usageSignalStore';

test('parses accepted dismissed and snoozed usage signals',()=>{
  for(const action of ['accepted','dismissed','snoozed'] as const){
    const signal=parseUsageSignalLine(JSON.stringify({version:1,recordedAt:'2026-07-27T12:00:00Z',action,turnId:'turn-1',suggestionId:`suggestion-${action}`,role:'architect',title:'Next slice',provider:'codex'}));
    assert.equal(signal?.action,action);
    assert.equal(signal?.provider,'codex');
  }
});

test('rejects malformed or unknown signal lines',()=>{
  assert.equal(parseUsageSignalLine('not json'),undefined);
  assert.equal(parseUsageSignalLine(JSON.stringify({version:2,action:'accepted'})),undefined);
  assert.equal(parseUsageSignalLine(JSON.stringify({version:1,recordedAt:'now',action:'clicked',turnId:'t',suggestionId:'s',role:'architect',title:'x'})),undefined);
});

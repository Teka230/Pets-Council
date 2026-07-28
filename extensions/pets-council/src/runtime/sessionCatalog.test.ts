import assert from 'node:assert/strict';
import test from 'node:test';
import { parseThreadList, sessionDisplayName } from './sessionCatalog';

test('parses thread/list metadata and nested status',()=>{const page=parseThreadList({data:[{id:'thr-1',preview:'Refactor runtime',cwd:'/workspace',model:'gpt-5.5',createdAt:10,updatedAt:20,recencyAt:30,status:{type:'idle'}}],nextCursor:'next'});assert.equal(page.data[0]?.id,'thr-1');assert.equal(page.data[0]?.status,'idle');assert.equal(page.nextCursor,'next');});
test('prefers local aliases without modifying server previews',()=>{const thread={id:'thr-1',preview:'Server preview'};assert.equal(sessionDisplayName(thread,{'thr-1':'My local title'}),'My local title');assert.equal(sessionDisplayName(thread,{}),'Server preview');});

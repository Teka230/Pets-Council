import assert from 'node:assert/strict';
import test from 'node:test';
import { COUNCIL_ROLE_IDS, COUNCIL_ROLES, type CouncilTurn } from './domain';
import { reviewMockTurn } from './mockCouncil';
import { SAMPLE_COUNCIL_TURN } from './sampleTurn';

test('returns every role in stable order with Greffier display name',()=>{const review=reviewMockTurn(SAMPLE_COUNCIL_TURN);assert.deepEqual(review.roles.map((role)=>role.role),COUNCIL_ROLE_IDS);assert.equal(COUNCIL_ROLES.find((role)=>role.id==='notetaker')?.name,'Greffier');});
test('is deterministic and returns zero to two suggestions per role',()=>{assert.deepEqual(reviewMockTurn(SAMPLE_COUNCIL_TURN),reviewMockTurn(SAMPLE_COUNCIL_TURN));for(const role of reviewMockTurn(SAMPLE_COUNCIL_TURN).roles)assert.ok(role.suggestions.length<=2);});
test('supports a silent strategist',()=>{assert.deepEqual(reviewMockTurn(SAMPLE_COUNCIL_TURN).roles.find((role)=>role.role==='strategist')?.suggestions,[]);});
test('Greffier preserves a Git checkpoint without assistant response',()=>{const turn:CouncilTurn={...SAMPLE_COUNCIL_TURN,assistantResponse:''};assert.equal(reviewMockTurn(turn).roles.find((role)=>role.role==='notetaker')?.suggestions.length,1);});
test('all companions stay silent without live evidence',()=>{const turn:CouncilTurn={...SAMPLE_COUNCIL_TURN,capture:{mode:'live',capturedAt:'2026-07-25T13:35:14.000Z',warnings:[]},userMessage:'placeholder',assistantResponse:'placeholder',workspace:{},git:undefined};assert.ok(reviewMockTurn(turn).roles.every((role)=>role.suggestions.length===0));});

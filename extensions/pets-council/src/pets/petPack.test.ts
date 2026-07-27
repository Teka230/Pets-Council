import assert from 'node:assert/strict';
import test from 'node:test';
import { reviewMockTurn } from '../mockCouncil';
import { SAMPLE_COUNCIL_TURN } from '../sampleTurn';
import { BUILTIN_PET_PACK, buildPetSnapshots, validatePetPack } from './petPack';

const runtime={phase:'ready' as const,binary:'codex',message:'ready',thread:{phase:'ready' as const,message:'ready',thread:{id:'t'}},turn:{phase:'completed' as const,message:'done'}};

test('keeps visual pets separate from role assignments',()=>{assert.deepEqual(validatePetPack(BUILTIN_PET_PACK),[]);assert.notEqual(BUILTIN_PET_PACK.pets[0].id,BUILTIN_PET_PACK.assignments[0].role);});
test('maps reviewing and approval states to companions',()=>{const review=reviewMockTurn(SAMPLE_COUNCIL_TURN);const thinking=buildPetSnapshots(review,{phase:'reviewing',provider:'codex',message:'thinking'},runtime);assert.ok(thinking.every((pet)=>pet.state==='thinking'));const approval=buildPetSnapshots(review,{phase:'ready',provider:'codex',message:'ready'},{...runtime,approval:{requestId:1,kind:'commandExecution',threadId:'t',turnId:'x',itemId:'i'}});assert.equal(approval.find((pet)=>pet.role==='guardian')?.state,'approval');});

import assert from 'node:assert/strict';
import test from 'node:test';
import { reviewMockTurn } from '../mockCouncil';
import { SAMPLE_COUNCIL_TURN } from '../sampleTurn';
import { BUILTIN_PET_PACK, buildPetSnapshots, validatePetPack, type PetPackManifest } from './petPack';

const runtime={phase:'ready' as const,binary:'codex',message:'ready',thread:{phase:'ready' as const,message:'ready',thread:{id:'t'}},turn:{phase:'completed' as const,message:'done'}};

test('keeps visual pets separate from role assignments',()=>{assert.deepEqual(validatePetPack(BUILTIN_PET_PACK),[]);assert.notEqual(BUILTIN_PET_PACK.pets[0].id,BUILTIN_PET_PACK.assignments[0].role);});
test('maps reviewing and approval states to companions',()=>{const review=reviewMockTurn(SAMPLE_COUNCIL_TURN);const thinking=buildPetSnapshots(review,{phase:'reviewing',provider:'codex',message:'thinking'},runtime);assert.ok(thinking.every((pet)=>pet.state==='thinking'));const approval=buildPetSnapshots(review,{phase:'ready',provider:'codex',message:'ready'},{...runtime,approval:{requestId:1,kind:'commandExecution',threadId:'t',turnId:'x',itemId:'i'}});assert.equal(approval.find((pet)=>pet.role==='guardian')?.state,'approval');assert.equal(approval.find((pet)=>pet.role==='guardian')?.anchor,'terminal');});
test('ships a real atlas for every built-in companion',()=>{for(const pet of BUILTIN_PET_PACK.pets){assert.equal(pet.atlas?.format,'strip-v1');assert.match(pet.atlas?.dataUri??'',/^data:image\/svg\+xml,/);assert.equal(pet.atlas?.columns,6);assert.equal(pet.atlas?.states.suggestion.column,2);}});
test('validates the fixed Hatch v2 atlas contract',()=>{const manifest:PetPackManifest={schemaVersion:1,id:'hatch',name:'Hatch',version:'1',pets:[{id:'pet',name:'Pet',glyph:'P',description:'',atlas:{format:'hatch-v2',dataUri:'data:image/png;base64,AA==',cellWidth:100,cellHeight:100,columns:8,rows:11,states:{idle:{column:0,row:0},thinking:{column:1,row:0},suggestion:{column:2,row:0},silent:{column:3,row:0},approval:{column:4,row:0},error:{column:5,row:0}}}}],assignments:[{role:'architect',petId:'pet'}]};assert.ok(validatePetPack(manifest).some((error)=>error.includes('192×208')));});

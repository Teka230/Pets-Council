import assert from 'node:assert/strict';
import test from 'node:test';
import { applyPetPlacements, normalizePetPlacement, parsePetPlacementMap } from './placement';
import type { PetSnapshot } from './petPack';

const pet:PetSnapshot={role:'architect',petId:'orbital',name:'Orbital',glyph:'O',state:'idle',suggestionCount:0,anchor:'editor'};

test('normalizes and bounds persisted placements',()=>{assert.deepEqual(normalizePetPlacement({x:12.4,y:18.8}),{x:12,y:19});assert.deepEqual(normalizePetPlacement({x:9999,y:-9999}),{x:2000,y:-2000});assert.equal(normalizePetPlacement({x:'12',y:4}),undefined);});
test('parses only known role placements',()=>{assert.deepEqual(parsePetPlacementMap({architect:{x:10,y:20},unknown:{x:1,y:2}}),{architect:{x:10,y:20}});});
test('applies custom placement except during critical states',()=>{assert.deepEqual(applyPetPlacements([pet],{architect:{x:10,y:20}})[0].placement,{x:10,y:20});assert.equal(applyPetPlacements([{...pet,state:'approval'}],{architect:{x:10,y:20}})[0].placement,undefined);assert.equal(applyPetPlacements([{...pet,state:'error'}],{architect:{x:10,y:20}})[0].placement,undefined);});

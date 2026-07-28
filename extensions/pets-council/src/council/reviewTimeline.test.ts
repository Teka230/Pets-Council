import assert from 'node:assert/strict';
import test from 'node:test';
import type { CouncilReview, CouncilReviewState, CouncilTurn } from '../domain';
import { findCouncilTimelineSuggestion, upsertCouncilTurnReview } from './reviewTimeline';

const turn=(turnId:string):CouncilTurn=>({turnId,userMessage:`Question ${turnId}`,assistantResponse:`Answer ${turnId}`,capture:{mode:'live',capturedAt:new Date(0).toISOString(),warnings:[]},workspace:{name:'demo'},runtime:{source:'codex',threadId:'thread-1',turnId}});
const review=(turnId:string,title:string):CouncilReview=>({turnId,roles:[{role:'architect',suggestions:[{id:`suggestion-${turnId}`,role:'architect',title,rationale:'Why',prompt:'Do it',actionLabel:'Use in Codex'}]},{role:'guardian',suggestions:[]},{role:'strategist',suggestions:[]},{role:'notetaker',suggestions:[]}]});
const state=(turnId:string):CouncilReviewState=>({phase:'ready',provider:'codex',message:'Done',turnId});

test('replaces the review for the same Codex turn',()=>{const first={turn:turn('1'),review:review('1','Old'),state:state('1')};const second={turn:turn('1'),review:review('1','New'),state:state('1')};const result=upsertCouncilTurnReview(upsertCouncilTurnReview([],first),second);assert.equal(result.length,1);assert.equal(result[0]?.review.roles[0]?.suggestions[0]?.title,'New');});
test('finds suggestions from older reviewed turns',()=>{const entries=upsertCouncilTurnReview(upsertCouncilTurnReview([],{turn:turn('1'),review:review('1','One'),state:state('1')}),{turn:turn('2'),review:review('2','Two'),state:state('2')});const found=findCouncilTimelineSuggestion(entries,'suggestion-1');assert.equal(found?.entry.turn.turnId,'1');assert.equal(found?.suggestion.title,'One');});
test('ignores non-Codex context reviews',()=>{const contextTurn={...turn('context'),runtime:undefined};const result=upsertCouncilTurnReview([],{turn:contextTurn,review:review('context','Context'),state:state('context')});assert.deepEqual(result,[]);});

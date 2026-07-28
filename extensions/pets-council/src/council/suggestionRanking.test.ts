import assert from 'node:assert/strict';
import test from 'node:test';
import { rankCouncilReview, summarizeRoleSignals } from './suggestionRanking';
import type { CouncilReview } from '../domain';
import type { SuggestionUsageSignal } from '../memory/usageSignals';

const review:CouncilReview={turnId:'turn',roles:[{role:'architect',suggestions:[{id:'a',role:'architect',title:'Large rewrite',rationale:'r',prompt:'p',actionLabel:'Use in Codex'},{id:'b',role:'architect',title:'Small slice',rationale:'r',prompt:'p',actionLabel:'Use in Codex'}]},{role:'guardian',suggestions:[]},{role:'strategist',suggestions:[]},{role:'notetaker',suggestions:[]}]};
const signals:SuggestionUsageSignal[]=[signal('Large rewrite','dismissed'),signal('Large rewrite','dismissed'),signal('Small slice','accepted')];

test('ranks suggestions from explicit local outcomes while preserving content',()=>{const ranked=rankCouncilReview(review,signals);assert.deepEqual(ranked.review.roles[0].suggestions.map((item)=>item.id),['b','a']);assert.equal(ranked.review.roles[0].suggestions[0].prompt,'p');assert.ok(ranked.explanations.find((item)=>item.suggestionId==='b')!.score>ranked.explanations.find((item)=>item.suggestionId==='a')!.score);});
test('summarizes role outcomes without personal identifiers',()=>{assert.deepEqual(summarizeRoleSignals(signals).architect,{accepted:1,dismissed:2,snoozed:0});});

function signal(title:string,action:SuggestionUsageSignal['action']):SuggestionUsageSignal{return{version:1,recordedAt:'2026-07-28T12:00:00Z',action,turnId:'t',suggestionId:`${title}-${action}`,role:'architect',title,provider:'codex'};}

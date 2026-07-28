import assert from 'node:assert/strict';
import test from 'node:test';
import type { CouncilReview } from '../domain';
import { applyCompanionSilencePolicies, buildCompanionSilencePolicies, MIN_ROLE_OUTCOMES } from './silenceTuning';
import type { SuggestionUsageAction, SuggestionUsageSignal } from './usageSignals';

function signals(role:SuggestionUsageSignal['role'],actions:readonly SuggestionUsageAction[]):SuggestionUsageSignal[]{return actions.map((action,index)=>({version:1,recordedAt:new Date(index).toISOString(),action,turnId:`turn-${index}`,suggestionId:`suggestion-${index}`,role,title:'Suggestion',provider:'codex'}));}

test('does not tune a role before the minimum evidence threshold',()=>{const policy=buildCompanionSilencePolicies(signals('architect',Array(MIN_ROLE_OUTCOMES-1).fill('dismissed'))).find((item)=>item.role==='architect');assert.equal(policy?.applied,false);assert.equal(policy?.maxSuggestions,2);});
test('silences repeatedly dismissed roles and limits mixed roles to one suggestion',()=>{const low=buildCompanionSilencePolicies(signals('guardian',Array(12).fill('dismissed'))).find((item)=>item.role==='guardian');const mixed=buildCompanionSilencePolicies(signals('strategist',[...Array(3).fill('accepted'),...Array(9).fill('dismissed')])).find((item)=>item.role==='strategist');assert.equal(low?.maxSuggestions,0);assert.equal(mixed?.maxSuggestions,1);});
test('applies only role-local suggestion limits',()=>{const review:CouncilReview={turnId:'turn',roles:[{role:'architect',suggestions:[{id:'a1',role:'architect',title:'A1',rationale:'',prompt:'',actionLabel:''},{id:'a2',role:'architect',title:'A2',rationale:'',prompt:'',actionLabel:''}]},{role:'guardian',suggestions:[{id:'g1',role:'guardian',title:'G1',rationale:'',prompt:'',actionLabel:''}]},{role:'strategist',suggestions:[]},{role:'notetaker',suggestions:[]}]};const policies=buildCompanionSilencePolicies([...signals('architect',Array(12).fill('dismissed')),...signals('guardian',Array(12).fill('accepted'))]);const tuned=applyCompanionSilencePolicies(review,policies);assert.equal(tuned.roles[0]?.suggestions.length,0);assert.equal(tuned.roles[1]?.suggestions.length,1);});

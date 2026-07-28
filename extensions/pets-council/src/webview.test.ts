import assert from 'node:assert/strict';
import test from 'node:test';
import type { CouncilTurnReviewEntry } from './council/reviewTimeline';
import { reviewMockTurn } from './mockCouncil';
import { buildPetSnapshots } from './pets/petPack';
import { SAMPLE_COUNCIL_TURN } from './sampleTurn';
import type { CodexRestoredTurn, CodexRuntimeStatus } from './runtime/types';
import { renderCouncilHtml } from './webview';

const council={phase:'ready' as const,provider:'codex' as const,message:'Structured review complete.',turnId:'demo'};
const runtime:CodexRuntimeStatus={phase:'ready',binary:'codex',message:'Connected.',models:[{id:'gpt-5.5',model:'gpt-5.5',displayName:'GPT-5.5',isDefault:true,supportedReasoningEfforts:['medium','high'],defaultReasoningEffort:'medium'}],modelSelection:{model:'gpt-5.5',effort:'medium'},thread:{phase:'ready',message:'Thread ready.',thread:{id:'thread-1'}},turn:{phase:'completed',message:'Done.'}};
const history:readonly CodexRestoredTurn[]=[{turnId:'turn-1',userMessage:'First question',assistantMessage:'First answer'},{turnId:'turn-2',userMessage:'Second question',assistantMessage:'Second answer'}];
const reviewedTurn={...SAMPLE_COUNCIL_TURN,turnId:'turn-1',userMessage:'First question',assistantResponse:'First answer',runtime:{source:'codex' as const,threadId:'thread-1',turnId:'turn-1'}};
const reviewedTurnReview=reviewMockTurn(reviewedTurn);
const reviewTimeline:readonly CouncilTurnReviewEntry[]=[{turn:reviewedTurn,review:reviewedTurnReview,state:{phase:'ready',provider:'codex',message:'Done',turnId:'turn-1'}}];

function render(turn=SAMPLE_COUNCIL_TURN,status=runtime,turns:readonly CodexRestoredTurn[]=history,motion:'system'|'full'|'reduced'='system',reviews:readonly CouncilTurnReviewEntry[]=reviewTimeline):string{const review=reviewMockTurn(turn);return renderCouncilHtml(turn,review,council,status,buildPetSnapshots(review,council,status),turns,reviews,motion,'nonce');}

test('renders living companions and inject-to-Codex actions',()=>{const html=render();assert.match(html,/Living Council/);assert.match(html,/Use in Codex/);assert.match(html,/Save to graph/);assert.match(html,/Greffier/);assert.doesNotMatch(html,/Prepared Council prompt/);});
test('renders graph projection and motion preference',()=>{const turn={...SAMPLE_COUNCIL_TURN,projectContext:{summary:'Decision A',sources:['docs/roadmap.md'],graphNodeCount:3,graphEdgeCount:4,storagePath:'.pets-council/shared-context-graph.json'}};const html=render(turn,runtime,history,'reduced');assert.match(html,/Shared Context Graph/);assert.match(html,/3 nodes · 4 relations/);assert.match(html,/motion-reduced/);});
test('renders model effort controls and token usage',()=>{const html=render(SAMPLE_COUNCIL_TURN,{...runtime,tokenUsage:{last:{totalTokens:1200,inputTokens:800,cachedInputTokens:100,outputTokens:300,reasoningOutputTokens:100},modelContextWindow:128000,quotaUsedPercent:42}});assert.match(html,/codex-model-select/);assert.match(html,/codex-effort-select/);assert.match(html,/codex-model-select-composer/);assert.match(html,/codex-effort-select-composer/);assert.match(html,/1,200 tokens/);assert.match(html,/quota 42%/);});
test('renders all completed turns in the Codex timeline',()=>{const html=render();assert.match(html,/2 completed/);assert.match(html,/First question/);assert.match(html,/First answer/);assert.match(html,/Second question/);assert.match(html,/Second answer/);assert.match(html,/codex-timeline/);});
test('attaches the Council review to its source turn',()=>{const html=render();assert.match(html,/something to add/);assert.match(html,/turn-review/);assert.match(html,/Architect/);assert.match(html,/Use in Codex/);});
test('shows Council thinking without fabricated suggestions',()=>{const review={turnId:'demo',roles:['architect','guardian','strategist','notetaker'].map((role)=>({role:role as 'architect'|'guardian'|'strategist'|'notetaker',suggestions:[]}))};const thinking={phase:'reviewing' as const,provider:'codex' as const,message:'Thinking',turnId:'demo'};const html=renderCouncilHtml(SAMPLE_COUNCIL_TURN,review,thinking,runtime,buildPetSnapshots(review,thinking,runtime),history,[], 'system','nonce');assert.match(html,/The Council is thinking/);assert.match(html,/Reviewing/);});

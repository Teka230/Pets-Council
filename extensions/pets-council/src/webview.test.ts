import assert from 'node:assert/strict';
import test from 'node:test';
import { reviewMockTurn } from './mockCouncil';
import { buildPetSnapshots } from './pets/petPack';
import { SAMPLE_COUNCIL_TURN } from './sampleTurn';
import type { CodexRuntimeStatus } from './runtime/types';
import { renderCouncilHtml } from './webview';

const council={phase:'ready' as const,provider:'codex' as const,message:'Structured review complete.',turnId:'demo'};
const runtime:CodexRuntimeStatus={phase:'ready',binary:'codex',message:'Connected.',thread:{phase:'ready',message:'Thread ready.',thread:{id:'thread-1'}},turn:{phase:'completed',message:'Done.'}};

test('renders living companions and inject-to-Codex actions',()=>{const review=reviewMockTurn(SAMPLE_COUNCIL_TURN);const html=renderCouncilHtml(SAMPLE_COUNCIL_TURN,review,council,runtime,buildPetSnapshots(review,council,runtime),'system','nonce');assert.match(html,/Living Council/);assert.match(html,/Use in Codex/);assert.match(html,/Save to graph/);assert.match(html,/Greffier/);assert.doesNotMatch(html,/Prepared Council prompt/);});
test('renders graph projection and motion preference',()=>{const turn={...SAMPLE_COUNCIL_TURN,projectContext:{summary:'Decision A',sources:['docs/roadmap.md'],graphNodeCount:3,graphEdgeCount:4,storagePath:'.pets-council/shared-context-graph.json'}};const review=reviewMockTurn(turn);const html=renderCouncilHtml(turn,review,council,runtime,buildPetSnapshots(review,council,runtime),'reduced','nonce');assert.match(html,/Shared Context Graph/);assert.match(html,/3 nodes · 4 relations/);assert.match(html,/motion-reduced/);});
test('shows Council thinking without fabricated suggestions',()=>{const review={turnId:'demo',roles:['architect','guardian','strategist','notetaker'].map((role)=>({role:role as 'architect'|'guardian'|'strategist'|'notetaker',suggestions:[]}))};const thinking={phase:'reviewing' as const,provider:'codex' as const,message:'Thinking',turnId:'demo'};const html=renderCouncilHtml(SAMPLE_COUNCIL_TURN,review,thinking,runtime,buildPetSnapshots(review,thinking,runtime),'system','nonce');assert.match(html,/The Council is thinking/);assert.match(html,/Reviewing/);});

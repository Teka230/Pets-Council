import assert from 'node:assert/strict';
import test from 'node:test';
import type { CouncilTurn } from './domain';
import { reviewMockTurn } from './mockCouncil';
import type { CodexRuntimeStatus } from './runtime/types';
import { SAMPLE_COUNCIL_TURN } from './sampleTurn';
import { renderCouncilHtml } from './webview';

const IDLE = { phase: 'idle' as const, message: 'No turn.' };
const THREAD_READY: CodexRuntimeStatus = { phase:'ready',binary:'codex',message:'Connected.',thread:{phase:'ready',message:'Thread ready.',thread:{id:'thread-1'}},turn:IDLE };
const STREAMING: CodexRuntimeStatus = { ...THREAD_READY, turn:{phase:'streaming',message:'Codex is responding…',turnId:'turn-1',userMessage:'Hello',assistantMessage:'Working'} };
const APPROVAL: CodexRuntimeStatus = { ...STREAMING, approval:{requestId:'approval-1',kind:'commandExecution',threadId:'thread-1',turnId:'turn-1',itemId:'item-1',command:'npm test',cwd:'/workspace',reason:'Run tests'} };
const EMPTY: CouncilTurn = { ...SAMPLE_COUNCIL_TURN,capture:{mode:'live',capturedAt:'2026-07-25T13:35:14Z',warnings:[]},userMessage:'placeholder',assistantResponse:'placeholder',workspace:{},git:undefined };

test('keeps empty onboarding',()=>{const html=renderCouncilHtml(EMPTY,reviewMockTurn(EMPTY),{phase:'disconnected',binary:'codex',message:'Disconnected.',thread:{phase:'none',message:'No thread.'},turn:IDLE},'nonce');assert.match(html,/No project context yet/);});

test('shows Stop instead of duplicate Send during a turn',()=>{const html=renderCouncilHtml(SAMPLE_COUNCIL_TURN,reviewMockTurn(SAMPLE_COUNCIL_TURN),STREAMING,'nonce');assert.match(html,/id="interrupt-codex-turn"/);assert.doesNotMatch(html,/id="send-codex-turn"/);});

test('renders command approval with explicit allow and deny actions',()=>{const html=renderCouncilHtml(SAMPLE_COUNCIL_TURN,reviewMockTurn(SAMPLE_COUNCIL_TURN),APPROVAL,'nonce');assert.match(html,/Command approval required/);assert.match(html,/npm test/);assert.match(html,/Allow once/);assert.match(html,/Deny/);assert.match(html,/Blocked pending your decision/);});

test('keeps approval details HTML escaped',()=>{const html=renderCouncilHtml(SAMPLE_COUNCIL_TURN,reviewMockTurn(SAMPLE_COUNCIL_TURN),{...APPROVAL,approval:{...APPROVAL.approval!,command:'echo <script>'}},'nonce');assert.match(html,/echo &lt;script&gt;/);assert.doesNotMatch(html,/echo <script>/);});

import assert from 'node:assert/strict';
import test from 'node:test';
import type { CouncilTurn } from './domain';
import { hasUsefulCouncilEvidence, inspectCouncilEvidence } from './evidence';
import { SAMPLE_COUNCIL_TURN } from './sampleTurn';

function liveTurn(overrides:Partial<CouncilTurn>={}):CouncilTurn{return{...SAMPLE_COUNCIL_TURN,...overrides,capture:{mode:'live',capturedAt:'2026-07-25T13:35:14.000Z',warnings:[]},userMessage:overrides.userMessage??'Review the current workspace context and suggest the next useful step.',assistantResponse:overrides.assistantResponse??'The live workspace context was captured.',workspace:overrides.workspace??{},git:overrides.git};}

test('ignores placeholder conversation text for ordinary live captures',()=>{assert.equal(hasUsefulCouncilEvidence(liveTurn()),false);});
test('accepts a completed Codex conversation as useful live evidence',()=>{const turn=liveTurn({userMessage:'Real question',assistantResponse:'Real answer',runtime:{source:'codex',threadId:'thread-1',turnId:'turn-1'}});assert.equal(inspectCouncilEvidence(turn).hasConversation,true);});
test('accepts editor and Git evidence',()=>{assert.equal(hasUsefulCouncilEvidence(liveTurn({workspace:{activeFile:'src/extension.ts'}})),true);assert.equal(hasUsefulCouncilEvidence(liveTurn({git:{branch:'main',changedFiles:[]}})),true);});
test('accepts a non-empty Shared Context Graph projection',()=>{assert.equal(hasUsefulCouncilEvidence(liveTurn({projectContext:{summary:'Decision: keep actions explicit.',sources:[],graphNodeCount:1,graphEdgeCount:0}})),true);});

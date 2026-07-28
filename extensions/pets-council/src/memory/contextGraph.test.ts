import assert from 'node:assert/strict';
import test from 'node:test';
import {
  emptyContextGraph,
  listOpenQuestions,
  projectContextGraph,
  projectContextGraphForActors,
  queryContextGraph,
  recordAcceptedSuggestion,
  recordOpenQuestion,
  resolveOpenQuestion,
  supersedeContextNode
} from './contextGraph';
import { SAMPLE_COUNCIL_TURN } from '../sampleTurn';

const suggestion = { id:'s-1',role:'notetaker' as const,title:'Record decision',rationale:'Durable',prompt:'Preserve the decision.',actionLabel:'Use in Codex' };

test('records messages, proposal, decision, and provenance relations', () => {
  const graph = recordAcceptedSuggestion(emptyContextGraph('2026-01-01T00:00:00Z'), SAMPLE_COUNCIL_TURN, suggestion, '2026-01-01T00:00:01Z', () => 'id');
  assert.equal(graph.nodes.filter((node) => node.type === 'decision').length, 1);
  assert.ok(graph.edges.some((edge) => edge.type === 'accepted_as'));
  assert.ok(graph.edges.some((edge) => edge.type === 'responds_to'));
});

test('projects durable graph nodes and known sources within a bound', () => {
  const graph = recordAcceptedSuggestion(emptyContextGraph(), SAMPLE_COUNCIL_TURN, suggestion);
  const projection = projectContextGraph(graph, [{ path:'docs/roadmap.md',content:'Roadmap content' }], '.pets-council/shared-context-graph.json', 300);
  assert.match(projection.summary, /Record decision/);
  assert.deepEqual(projection.sources, ['docs/roadmap.md']);
  assert.equal(projection.storagePath, '.pets-council/shared-context-graph.json');
});

test('tracks open questions until an explicit resolution',()=>{
  const withQuestion=recordOpenQuestion(emptyContextGraph(),'Choose storage','Should storage use JSON or SQLite?','human',undefined,'2026-01-01T00:00:00Z',()=> 'q1');
  assert.equal(listOpenQuestions(withQuestion).length,1);
  const resolved=resolveOpenQuestion(withQuestion,'question:q1','Use JSON for the first local version.','human','2026-01-01T00:00:01Z',()=> 'r1');
  assert.equal(listOpenQuestions(resolved).length,0);
  assert.ok(resolved.edges.some((edge)=>edge.type==='resolves'&&edge.to==='question:q1'));
});

test('keeps superseded decisions in provenance but removes them from active queries',()=>{
  const graph=recordAcceptedSuggestion(emptyContextGraph(),SAMPLE_COUNCIL_TURN,suggestion,'2026-01-01T00:00:00Z',()=> 'first');
  const oldDecision=graph.nodes.find((node)=>node.type==='decision')!;
  const next=supersedeContextNode(graph,oldDecision.id,{title:'Current decision',content:'Use the new approach.'},'2026-01-02T00:00:00Z',()=> 'next');
  assert.equal(queryContextGraph(next,{types:['decision'],activeOnly:true}).length,1);
  assert.equal(queryContextGraph(next,{types:['decision']}).length,2);
  assert.ok(next.edges.some((edge)=>edge.type==='supersedes'&&edge.to===oldDecision.id));
});

test('builds distinct projections for Codex and every Council actor',()=>{
  const graph=recordOpenQuestion(recordAcceptedSuggestion(emptyContextGraph(),SAMPLE_COUNCIL_TURN,suggestion),'Release risk','What still blocks desktop validation?');
  const projections=projectContextGraphForActors(graph,[{path:'docs/roadmap.md',content:'Desktop smoke then Pet Packs.'}],'.pets-council/shared-context-graph.json');
  assert.deepEqual(Object.keys(projections).sort(),['architect','codex','guardian','notetaker','strategist']);
  assert.match(projections.guardian.summary,/QUESTION|Release risk/i);
  assert.match(projections.architect.summary,/DECISION|Record decision/i);
  assert.equal(projections.notetaker.openQuestionCount,1);
});

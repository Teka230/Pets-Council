import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyContextGraph, projectContextGraph, recordAcceptedSuggestion } from './contextGraph';
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

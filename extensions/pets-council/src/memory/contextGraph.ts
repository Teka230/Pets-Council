import { randomUUID } from 'node:crypto';
import type { CouncilSuggestion, CouncilTurn, ProjectContextSlice } from '../domain';

export const CONTEXT_GRAPH_VERSION = 1 as const;
export const MAX_GRAPH_NODES = 500;
export const MAX_GRAPH_EDGES = 1_000;
export const MAX_GRAPH_PROJECTION_CHARS = 4_000;

export type ContextNodeType =
  | 'message'
  | 'file'
  | 'code_range'
  | 'command'
  | 'result'
  | 'hypothesis'
  | 'decision'
  | 'question'
  | 'proposal'
  | 'note'
  | 'source';

export type ContextEdgeType =
  | 'responds_to'
  | 'derived_from'
  | 'concerns'
  | 'produced_by'
  | 'supersedes'
  | 'validates'
  | 'contradicts'
  | 'accepted_as';

export type ContextGraphNode = Readonly<{
  id: string;
  type: ContextNodeType;
  title: string;
  content: string;
  createdAt: string;
  actor: string;
  sourceTurnId?: string;
  metadata?: Readonly<Record<string, string | number | boolean>>;
}>;

export type ContextGraphEdge = Readonly<{
  id: string;
  type: ContextEdgeType;
  from: string;
  to: string;
  createdAt: string;
  actor: string;
}>;

export type SharedContextGraph = Readonly<{
  version: typeof CONTEXT_GRAPH_VERSION;
  updatedAt: string;
  nodes: readonly ContextGraphNode[];
  edges: readonly ContextGraphEdge[];
}>;

export function emptyContextGraph(now = new Date().toISOString()): SharedContextGraph {
  return { version: CONTEXT_GRAPH_VERSION, updatedAt: now, nodes: [], edges: [] };
}

export function parseContextGraph(value: unknown): SharedContextGraph {
  if (typeof value !== 'object' || value === null) return emptyContextGraph();
  const candidate = value as Record<string, unknown>;
  if (candidate.version !== CONTEXT_GRAPH_VERSION) return emptyContextGraph();
  const nodes = Array.isArray(candidate.nodes)
    ? candidate.nodes.map(parseNode).filter((node): node is ContextGraphNode => Boolean(node))
    : [];
  const edges = Array.isArray(candidate.edges)
    ? candidate.edges.map(parseEdge).filter((edge): edge is ContextGraphEdge => Boolean(edge))
    : [];
  return {
    version: CONTEXT_GRAPH_VERSION,
    updatedAt: typeof candidate.updatedAt === 'string' ? candidate.updatedAt : new Date().toISOString(),
    nodes: nodes.slice(-MAX_GRAPH_NODES),
    edges: edges.slice(-MAX_GRAPH_EDGES)
  };
}

export function recordAcceptedSuggestion(
  graph: SharedContextGraph,
  turn: CouncilTurn,
  suggestion: CouncilSuggestion,
  now = new Date().toISOString(),
  idFactory: () => string = randomUUID
): SharedContextGraph {
  const userId = `message:user:${turn.turnId}`;
  const assistantId = `message:assistant:${turn.turnId}`;
  const proposalId = `proposal:${suggestion.id}`;
  const decisionId = `decision:${suggestion.id}`;
  const nodes: ContextGraphNode[] = [...graph.nodes];
  const edges: ContextGraphEdge[] = [...graph.edges];

  addNode(nodes, { id:userId,type:'message',title:'User message',content:turn.userMessage,createdAt:now,actor:'human',sourceTurnId:turn.turnId });
  addNode(nodes, { id:assistantId,type:'message',title:'Primary Codex response',content:turn.assistantResponse,createdAt:now,actor:'codex',sourceTurnId:turn.turnId });
  addNode(nodes, {
    id:proposalId,type:'proposal',title:suggestion.title,content:`${suggestion.rationale}\n\n${suggestion.prompt}`,
    createdAt:now,actor:`council:${suggestion.role}`,sourceTurnId:turn.turnId,
    metadata:{ role:suggestion.role,activeFile:turn.workspace.activeFile ?? '',branch:turn.git?.branch ?? '' }
  });
  addNode(nodes, {
    id:decisionId,type:'decision',title:`Accepted Council proposal: ${suggestion.title}`,content:suggestion.prompt,
    createdAt:now,actor:'human',sourceTurnId:turn.turnId,metadata:{ role:suggestion.role }
  });

  addEdge(edges, edge('responds_to',assistantId,userId,'codex',now,idFactory));
  addEdge(edges, edge('derived_from',proposalId,assistantId,`council:${suggestion.role}`,now,idFactory));
  addEdge(edges, edge('concerns',proposalId,userId,`council:${suggestion.role}`,now,idFactory));
  addEdge(edges, edge('accepted_as',decisionId,proposalId,'human',now,idFactory));
  addEdge(edges, edge('produced_by',decisionId,userId,'human',now,idFactory));

  return { version:CONTEXT_GRAPH_VERSION,updatedAt:now,nodes:nodes.slice(-MAX_GRAPH_NODES),edges:edges.slice(-MAX_GRAPH_EDGES) };
}

export function projectContextGraph(
  graph: SharedContextGraph,
  sources: readonly { path: string; content: string }[] = [],
  storagePath?: string,
  maxChars = MAX_GRAPH_PROJECTION_CHARS
): ProjectContextSlice {
  const durableNodes = graph.nodes.filter((node) => ['decision','question','proposal','note'].includes(node.type)).slice(-20);
  const sections: string[] = [];
  if (durableNodes.length) {
    sections.push('DURABLE GRAPH CONTEXT');
    for (const node of durableNodes) sections.push(`- [${node.type}] ${node.title}: ${compact(node.content,500)}`);
  }
  for (const source of sources) sections.push(`SOURCE ${source.path}\n${compact(source.content,1_500)}`);
  const combined = sections.join('\n\n').trim();
  const truncated = combined.length > maxChars;
  const summary = combined
    ? truncated ? `${combined.slice(0,maxChars-1)}…` : combined
    : 'No durable graph nodes or configured project sources are available yet.';
  return {
    summary,
    sources:sources.map((source) => source.path),
    graphNodeCount:graph.nodes.length,
    graphEdgeCount:graph.edges.length,
    storagePath,
    truncated:truncated || undefined
  };
}

function parseNode(value: unknown): ContextGraphNode | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const node = value as Record<string, unknown>;
  if (!string(node.id)||!string(node.type)||!string(node.title)||!string(node.content)||!string(node.createdAt)||!string(node.actor)) return undefined;
  return {
    id:node.id,type:node.type as ContextNodeType,title:node.title,content:node.content,createdAt:node.createdAt,actor:node.actor,
    sourceTurnId:string(node.sourceTurnId)?node.sourceTurnId:undefined,
    metadata:typeof node.metadata==='object'&&node.metadata!==null?node.metadata as Record<string,string|number|boolean>:undefined
  };
}
function parseEdge(value: unknown): ContextGraphEdge | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const edgeValue=value as Record<string,unknown>;
  if (!string(edgeValue.id)||!string(edgeValue.type)||!string(edgeValue.from)||!string(edgeValue.to)||!string(edgeValue.createdAt)||!string(edgeValue.actor)) return undefined;
  return edgeValue as unknown as ContextGraphEdge;
}
function addNode(nodes: ContextGraphNode[], node: ContextGraphNode): void { if(!nodes.some((candidate)=>candidate.id===node.id))nodes.push(node); }
function addEdge(edges: ContextGraphEdge[], value: ContextGraphEdge): void { if(!edges.some((candidate)=>candidate.type===value.type&&candidate.from===value.from&&candidate.to===value.to))edges.push(value); }
function edge(type:ContextEdgeType,from:string,to:string,actor:string,createdAt:string,idFactory:()=>string):ContextGraphEdge{return{id:`edge:${idFactory()}`,type,from,to,actor,createdAt};}
function string(value: unknown): value is string { return typeof value === 'string' && value.length > 0; }
function compact(value:string,maxLength:number):string{const normalized=value.replace(/\s+/g,' ').trim();return normalized.length<=maxLength?normalized:`${normalized.slice(0,maxLength-1)}…`;}

import { randomUUID } from 'node:crypto';
import { CONTEXT_PROJECTION_ACTORS, type ContextProjectionActor, type CouncilSuggestion, type CouncilTurn, type ProjectContextSlice } from '../domain';

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
  | 'resolves'
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

export type ContextGraphQuery = Readonly<{
  text?: string;
  types?: readonly ContextNodeType[];
  actors?: readonly string[];
  activeOnly?: boolean;
  limit?: number;
}>;

export type ContextGraphProjectionMap = Readonly<Record<ContextProjectionActor, ProjectContextSlice>>;

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
    ? candidate.edges.map(parseEdge).filter((edgeValue): edgeValue is ContextGraphEdge => Boolean(edgeValue))
    : [];
  return boundedGraph({
    version: CONTEXT_GRAPH_VERSION,
    updatedAt: typeof candidate.updatedAt === 'string' ? candidate.updatedAt : new Date().toISOString(),
    nodes,
    edges
  });
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

  addEdge(edges, relation('responds_to',assistantId,userId,'codex',now,idFactory));
  addEdge(edges, relation('derived_from',proposalId,assistantId,`council:${suggestion.role}`,now,idFactory));
  addEdge(edges, relation('concerns',proposalId,userId,`council:${suggestion.role}`,now,idFactory));
  addEdge(edges, relation('accepted_as',decisionId,proposalId,'human',now,idFactory));
  addEdge(edges, relation('produced_by',decisionId,userId,'human',now,idFactory));

  return boundedGraph({ version:CONTEXT_GRAPH_VERSION,updatedAt:now,nodes,edges });
}

export function recordOpenQuestion(
  graph: SharedContextGraph,
  title: string,
  content: string,
  actor = 'human',
  sourceTurnId?: string,
  now = new Date().toISOString(),
  idFactory: () => string = randomUUID
): SharedContextGraph {
  const node: ContextGraphNode = {
    id:`question:${idFactory()}`,type:'question',title:boundedText(title,180),content:boundedText(content,2_000),createdAt:now,actor,sourceTurnId
  };
  return boundedGraph({ ...graph,updatedAt:now,nodes:[...graph.nodes,node] });
}

export function resolveOpenQuestion(
  graph: SharedContextGraph,
  questionId: string,
  resolution: string,
  actor = 'human',
  now = new Date().toISOString(),
  idFactory: () => string = randomUUID
): SharedContextGraph {
  const question = graph.nodes.find((node) => node.id === questionId && node.type === 'question');
  if (!question) throw new Error(`Open question not found: ${questionId}`);
  if (!listOpenQuestions(graph).some((node) => node.id === questionId)) throw new Error(`Question is already resolved or superseded: ${question.title}`);
  const decision: ContextGraphNode = {
    id:`decision:${idFactory()}`,type:'decision',title:`Resolution: ${question.title}`,content:boundedText(resolution,2_000),createdAt:now,actor,sourceTurnId:question.sourceTurnId,
    metadata:{ resolvesQuestion:question.id }
  };
  return boundedGraph({
    ...graph,updatedAt:now,nodes:[...graph.nodes,decision],edges:[...graph.edges,relation('resolves',decision.id,question.id,actor,now,idFactory)]
  });
}

export function supersedeContextNode(
  graph: SharedContextGraph,
  previousNodeId: string,
  replacement: Readonly<{ type?: ContextNodeType; title:string; content:string; actor?:string; sourceTurnId?:string }>,
  now = new Date().toISOString(),
  idFactory: () => string = randomUUID
): SharedContextGraph {
  const previous = graph.nodes.find((node) => node.id === previousNodeId);
  if (!previous) throw new Error(`Context node not found: ${previousNodeId}`);
  const node: ContextGraphNode = {
    id:`${replacement.type ?? previous.type}:${idFactory()}`,
    type:replacement.type ?? previous.type,
    title:boundedText(replacement.title,180),
    content:boundedText(replacement.content,2_000),
    createdAt:now,
    actor:replacement.actor ?? 'human',
    sourceTurnId:replacement.sourceTurnId ?? previous.sourceTurnId,
    metadata:{ supersedes:previous.id }
  };
  return boundedGraph({
    ...graph,updatedAt:now,nodes:[...graph.nodes,node],edges:[...graph.edges,relation('supersedes',node.id,previous.id,node.actor,now,idFactory)]
  });
}

export function queryContextGraph(graph: SharedContextGraph, query: ContextGraphQuery = {}): readonly ContextGraphNode[] {
  const text = query.text?.trim().toLocaleLowerCase();
  const superseded = supersededNodeIds(graph);
  const limit = Math.max(1, Math.min(100, query.limit ?? 30));
  return [...graph.nodes]
    .reverse()
    .filter((node) => !query.activeOnly || !superseded.has(node.id))
    .filter((node) => !query.types?.length || query.types.includes(node.type))
    .filter((node) => !query.actors?.length || query.actors.includes(node.actor))
    .filter((node) => !text || `${node.title}\n${node.content}\n${node.actor}`.toLocaleLowerCase().includes(text))
    .slice(0, limit);
}

export function listOpenQuestions(graph: SharedContextGraph): readonly ContextGraphNode[] {
  const resolved = new Set(graph.edges.filter((edgeValue) => edgeValue.type === 'resolves').map((edgeValue) => edgeValue.to));
  const superseded = supersededNodeIds(graph);
  return graph.nodes.filter((node) => node.type === 'question' && !resolved.has(node.id) && !superseded.has(node.id));
}

export function projectContextGraph(
  graph: SharedContextGraph,
  sources: readonly { path: string; content: string }[] = [],
  storagePath?: string,
  maxChars = MAX_GRAPH_PROJECTION_CHARS
): ProjectContextSlice {
  return projectContextGraphForActor(graph,'codex',sources,storagePath,maxChars);
}

export function projectContextGraphForActors(
  graph: SharedContextGraph,
  sources: readonly { path: string; content: string }[] = [],
  storagePath?: string,
  maxChars = MAX_GRAPH_PROJECTION_CHARS
): ContextGraphProjectionMap {
  return Object.fromEntries(CONTEXT_PROJECTION_ACTORS.map((actor) => [actor,projectContextGraphForActor(graph,actor,sources,storagePath,maxChars)])) as ContextGraphProjectionMap;
}

export function projectContextGraphForActor(
  graph: SharedContextGraph,
  actor: ContextProjectionActor,
  sources: readonly { path: string; content: string }[] = [],
  storagePath?: string,
  maxChars = MAX_GRAPH_PROJECTION_CHARS
): ProjectContextSlice {
  const activeNodes = queryContextGraph(graph,{types:projectionTypes(actor),activeOnly:true,limit:24});
  const sections:string[]=[`ACTOR PROJECTION: ${actor.toUpperCase()}`];
  if (activeNodes.length) for (const node of activeNodes) sections.push(`- [${node.type}] ${node.title}: ${compact(node.content,projectionNodeLimit(actor))}`);
  else sections.push('- No active durable graph nodes for this actor.');
  for (const source of projectedSources(actor,sources)) sections.push(`SOURCE ${source.path}\n${compact(source.content,actor==='codex'?1_300:900)}`);
  const combined=sections.join('\n\n').trim();
  const truncated=combined.length>maxChars;
  return {
    actor,
    summary:truncated?`${combined.slice(0,maxChars-1)}…`:combined,
    sources:projectedSources(actor,sources).map((source)=>source.path),
    graphNodeCount:graph.nodes.length,
    graphEdgeCount:graph.edges.length,
    openQuestionCount:listOpenQuestions(graph).length,
    supersededCount:supersededNodeIds(graph).size,
    storagePath,
    truncated:truncated||undefined
  };
}

function projectionTypes(actor:ContextProjectionActor):readonly ContextNodeType[]{
  switch(actor){
    case'architect':return['decision','proposal','question','file','code_range'];
    case'guardian':return['question','hypothesis','result','decision','command'];
    case'strategist':return['decision','question','proposal','note'];
    case'notetaker':return['decision','question','proposal','note','source','hypothesis'];
    default:return['decision','question','note','proposal'];
  }
}
function projectedSources(actor:ContextProjectionActor,sources:readonly {path:string;content:string}[]):readonly {path:string;content:string}[]{
  if(actor==='guardian')return sources.filter((source)=>/roadmap|context|filrouge/i.test(source.path)).slice(0,2);
  if(actor==='notetaker')return sources.slice(0,4);
  return sources.slice(0,3);
}
function projectionNodeLimit(actor:ContextProjectionActor):number{return actor==='notetaker'?650:actor==='codex'?550:420;}
function supersededNodeIds(graph:SharedContextGraph):Set<string>{return new Set(graph.edges.filter((edgeValue)=>edgeValue.type==='supersedes').map((edgeValue)=>edgeValue.to));}
function boundedGraph(graph:SharedContextGraph):SharedContextGraph{return{version:CONTEXT_GRAPH_VERSION,updatedAt:graph.updatedAt,nodes:graph.nodes.slice(-MAX_GRAPH_NODES),edges:graph.edges.slice(-MAX_GRAPH_EDGES)};}
function parseNode(value: unknown): ContextGraphNode | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const node = value as Record<string, unknown>;
  if (!string(node.id)||!string(node.type)||!string(node.title)||!string(node.content)||!string(node.createdAt)||!string(node.actor)) return undefined;
  return {id:node.id,type:node.type as ContextNodeType,title:node.title,content:node.content,createdAt:node.createdAt,actor:node.actor,sourceTurnId:string(node.sourceTurnId)?node.sourceTurnId:undefined,metadata:typeof node.metadata==='object'&&node.metadata!==null?node.metadata as Record<string,string|number|boolean>:undefined};
}
function parseEdge(value: unknown): ContextGraphEdge | undefined {if(typeof value!=='object'||value===null)return undefined;const edgeValue=value as Record<string,unknown>;if(!string(edgeValue.id)||!string(edgeValue.type)||!string(edgeValue.from)||!string(edgeValue.to)||!string(edgeValue.createdAt)||!string(edgeValue.actor))return undefined;return edgeValue as unknown as ContextGraphEdge;}
function addNode(nodes: ContextGraphNode[], node: ContextGraphNode): void {if(!nodes.some((candidate)=>candidate.id===node.id))nodes.push(node);}
function addEdge(edges: ContextGraphEdge[], value: ContextGraphEdge): void {if(!edges.some((candidate)=>candidate.type===value.type&&candidate.from===value.from&&candidate.to===value.to))edges.push(value);}
function relation(type:ContextEdgeType,from:string,to:string,actor:string,createdAt:string,idFactory:()=>string):ContextGraphEdge{return{id:`edge:${idFactory()}`,type,from,to,actor,createdAt};}
function string(value: unknown): value is string {return typeof value==='string'&&value.length>0;}
function compact(value:string,maxLength:number):string{const normalized=value.replace(/\s+/g,' ').trim();return normalized.length<=maxLength?normalized:`${normalized.slice(0,maxLength-1)}…`;}
function boundedText(value:string,maxLength:number):string{const compacted=value.replace(/\s+/g,' ').trim();if(!compacted)throw new Error('Context graph text cannot be empty.');return compacted.length<=maxLength?compacted:`${compacted.slice(0,maxLength-1)}…`;}

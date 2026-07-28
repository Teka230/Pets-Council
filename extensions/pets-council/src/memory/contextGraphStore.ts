import * as vscode from 'vscode';
import type { CouncilSuggestion, CouncilTurn, ProjectContextSlice } from '../domain';
import {
  emptyContextGraph,
  listOpenQuestions,
  parseContextGraph,
  projectContextGraph,
  projectContextGraphForActors,
  queryContextGraph,
  recordAcceptedSuggestion,
  recordOpenQuestion,
  resolveOpenQuestion,
  supersedeContextNode,
  type ContextGraphProjectionMap,
  type ContextNodeType,
  type SharedContextGraph
} from './contextGraph';

const SOURCE_PATHS = ['docs/roadmap.md','.filrouge/roadmap.md','.filrouge/context.md','.filrouge/README.md'] as const;
const MAX_SOURCE_BYTES = 64 * 1024;
const decoder = new TextDecoder();
const encoder = new TextEncoder();

export class SharedContextGraphStore {
  async project(): Promise<ProjectContextSlice> {
    const location = await resolveGraphLocation();
    const graph = location ? await readGraph(location.uri) : emptyContextGraph();
    return projectContextGraph(graph, await readConfiguredSources(), location?.displayPath);
  }

  async projectAll(): Promise<ContextGraphProjectionMap> {
    const location = await resolveGraphLocation();
    const graph = location ? await readGraph(location.uri) : emptyContextGraph();
    return projectContextGraphForActors(graph, await readConfiguredSources(), location?.displayPath);
  }

  async recordSuggestion(turn: CouncilTurn, suggestion: CouncilSuggestion): Promise<ProjectContextSlice> {
    const location = await requireGraphLocation();
    const next = recordAcceptedSuggestion(await readGraph(location.uri), turn, suggestion);
    await writeGraph(location.uri,next);
    return projectContextGraph(next, await readConfiguredSources(), location.displayPath);
  }

  async addOpenQuestion(): Promise<void> {
    const location = await requireGraphLocation();
    const title = await vscode.window.showInputBox({ title:'Add an open project question',prompt:'State the unresolved question.',placeHolder:'What still needs to be decided?',ignoreFocusOut:true });
    if (!title?.trim()) return;
    const detail = await vscode.window.showInputBox({ title:'Add context',prompt:'Add the evidence or decision boundary that makes this question useful.',value:title,ignoreFocusOut:true });
    if (!detail?.trim()) return;
    await writeGraph(location.uri,recordOpenQuestion(await readGraph(location.uri),title,detail));
    void vscode.window.showInformationMessage(`Open question saved to ${location.displayPath}.`);
  }

  async resolveOpenQuestion(): Promise<void> {
    const location = await requireGraphLocation();
    const graph = await readGraph(location.uri);
    const questions = listOpenQuestions(graph);
    if (!questions.length) { void vscode.window.showInformationMessage('The Shared Context Graph has no open questions.'); return; }
    const selected = await vscode.window.showQuickPick(questions.map((node)=>({label:node.title,description:node.actor,detail:node.content,node})),{title:'Resolve an open project question',matchOnDescription:true,matchOnDetail:true,ignoreFocusOut:true});
    if (!selected) return;
    const resolution = await vscode.window.showInputBox({title:`Resolve: ${selected.node.title}`,prompt:'Record the current answer or decision. The original question remains in provenance.',ignoreFocusOut:true});
    if (!resolution?.trim()) return;
    await writeGraph(location.uri,resolveOpenQuestion(graph,selected.node.id,resolution));
    void vscode.window.showInformationMessage(`Resolved “${selected.node.title}”.`);
  }

  async supersedeDecision(): Promise<void> {
    const location = await requireGraphLocation();
    const graph = await readGraph(location.uri);
    const decisions = queryContextGraph(graph,{types:['decision'],activeOnly:true,limit:50});
    if (!decisions.length) { void vscode.window.showInformationMessage('The Shared Context Graph has no active decision to supersede.'); return; }
    const selected = await vscode.window.showQuickPick(decisions.map((node)=>({label:node.title,description:node.actor,detail:node.content,node})),{title:'Replace an active decision',matchOnDescription:true,matchOnDetail:true,ignoreFocusOut:true});
    if (!selected) return;
    const title = await vscode.window.showInputBox({title:'Replacement decision title',value:selected.node.title.replace(/^Accepted Council proposal:\s*/,'') ,ignoreFocusOut:true});
    if (!title?.trim()) return;
    const content = await vscode.window.showInputBox({title:'Replacement decision',prompt:'Explain the new current decision.',ignoreFocusOut:true});
    if (!content?.trim()) return;
    await writeGraph(location.uri,supersedeContextNode(graph,selected.node.id,{type:'decision',title,content}));
    void vscode.window.showInformationMessage(`Replaced “${selected.node.title}” while preserving provenance.`);
  }

  async query(): Promise<void> {
    const location = await requireGraphLocation();
    const graph = await readGraph(location.uri);
    const text = await vscode.window.showInputBox({title:'Query the Shared Context Graph',prompt:'Search titles, content, and actors. Leave empty to browse active durable nodes.',ignoreFocusOut:true});
    if (text === undefined) return;
    const types:readonly ContextNodeType[]=['decision','question','proposal','note','hypothesis','result'];
    const results=queryContextGraph(graph,{text,types,activeOnly:true,limit:50});
    if(!results.length){void vscode.window.showInformationMessage('No active graph node matches this query.');return;}
    const selected=await vscode.window.showQuickPick(results.map((node)=>({label:`[${node.type}] ${node.title}`,description:node.actor,detail:node.content,node})),{title:'Shared Context Graph results',matchOnDescription:true,matchOnDetail:true,ignoreFocusOut:true});
    if(selected)await this.openAtNode(selected.node.id);
  }

  async open(): Promise<void> {
    const location = await resolveGraphLocation();
    if (!location) { void vscode.window.showInformationMessage('Open a folder or workspace before opening the Shared Context Graph.'); return; }
    if (!(await exists(location.uri))) { void vscode.window.showInformationMessage('The Shared Context Graph will be created after you explicitly save a proposal or question.'); return; }
    const document = await vscode.workspace.openTextDocument(location.uri);
    await vscode.window.showTextDocument(document, { preview: false });
  }

  private async openAtNode(nodeId:string):Promise<void>{
    const location=await requireGraphLocation();
    if(!(await exists(location.uri)))return;
    const document=await vscode.workspace.openTextDocument(location.uri);
    const editor=await vscode.window.showTextDocument(document,{preview:false});
    const text=document.getText(),offset=text.indexOf(`"id": "${nodeId}"`);
    if(offset>=0){const position=document.positionAt(offset);editor.selection=new vscode.Selection(position,position);editor.revealRange(new vscode.Range(position,position),vscode.TextEditorRevealType.InCenter);}
  }
}

async function requireGraphLocation():Promise<{uri:vscode.Uri;displayPath:string}>{const location=await resolveGraphLocation();if(!location)throw new Error('Open a folder or workspace before changing the Shared Context Graph.');return location;}
async function resolveGraphLocation(): Promise<{ uri:vscode.Uri; displayPath:string }|undefined> {const folder=currentWorkspaceFolder();if(!folder)return undefined;const filRouge=vscode.Uri.joinPath(folder.uri,'.filrouge');const displayPath=await isDirectory(filRouge)?'.filrouge/council/shared-context-graph.json':'.pets-council/shared-context-graph.json';return{uri:vscode.Uri.joinPath(folder.uri,...displayPath.split('/')),displayPath};}
async function readGraph(uri:vscode.Uri):Promise<SharedContextGraph>{try{return parseContextGraph(JSON.parse(decoder.decode(await vscode.workspace.fs.readFile(uri))) as unknown);}catch{return emptyContextGraph();}}
async function writeGraph(uri:vscode.Uri,graph:SharedContextGraph):Promise<void>{await vscode.workspace.fs.createDirectory(parentUri(uri));await vscode.workspace.fs.writeFile(uri,encoder.encode(`${JSON.stringify(graph,null,2)}\n`));}
async function readConfiguredSources():Promise<readonly {path:string;content:string}[]>{const folder=currentWorkspaceFolder();if(!folder)return[];const sources:{path:string;content:string}[]=[];for(const pathValue of SOURCE_PATHS){const uri=vscode.Uri.joinPath(folder.uri,...pathValue.split('/'));try{const bytes=await vscode.workspace.fs.readFile(uri);sources.push({path:pathValue,content:bytes.byteLength>MAX_SOURCE_BYTES?`${decoder.decode(bytes.slice(0,MAX_SOURCE_BYTES))}\n[truncated]`:decoder.decode(bytes)});}catch{/* optional */}}return sources;}
function currentWorkspaceFolder():vscode.WorkspaceFolder|undefined{const activeUri=vscode.window.activeTextEditor?.document.uri;return(activeUri?vscode.workspace.getWorkspaceFolder(activeUri):undefined)??vscode.workspace.workspaceFolders?.[0];}
async function exists(uri:vscode.Uri):Promise<boolean>{try{await vscode.workspace.fs.stat(uri);return true;}catch{return false;}}
async function isDirectory(uri:vscode.Uri):Promise<boolean>{try{return((await vscode.workspace.fs.stat(uri)).type&vscode.FileType.Directory)!==0;}catch{return false;}}
function parentUri(uri:vscode.Uri):vscode.Uri{const segments=uri.path.split('/').filter(Boolean);segments.pop();return uri.with({path:`/${segments.join('/')}`});}

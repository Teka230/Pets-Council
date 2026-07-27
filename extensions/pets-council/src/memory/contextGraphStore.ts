import * as vscode from 'vscode';
import type { CouncilSuggestion, CouncilTurn, ProjectContextSlice } from '../domain';
import { emptyContextGraph, parseContextGraph, projectContextGraph, recordAcceptedSuggestion, type SharedContextGraph } from './contextGraph';

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

  async recordSuggestion(turn: CouncilTurn, suggestion: CouncilSuggestion): Promise<ProjectContextSlice> {
    const location = await resolveGraphLocation();
    if (!location) throw new Error('Open a folder or workspace before saving to the Shared Context Graph.');
    const graph = await readGraph(location.uri);
    const next = recordAcceptedSuggestion(graph, turn, suggestion);
    await vscode.workspace.fs.createDirectory(parentUri(location.uri));
    await vscode.workspace.fs.writeFile(location.uri, encoder.encode(`${JSON.stringify(next, null, 2)}\n`));
    return projectContextGraph(next, await readConfiguredSources(), location.displayPath);
  }

  async open(): Promise<void> {
    const location = await resolveGraphLocation();
    if (!location) {
      void vscode.window.showInformationMessage('Open a folder or workspace before opening the Shared Context Graph.');
      return;
    }
    if (!(await exists(location.uri))) {
      void vscode.window.showInformationMessage('The Shared Context Graph will be created after you explicitly save a Council proposal.');
      return;
    }
    const document = await vscode.workspace.openTextDocument(location.uri);
    await vscode.window.showTextDocument(document, { preview: false });
  }
}

async function resolveGraphLocation(): Promise<{ uri:vscode.Uri; displayPath:string }|undefined> {
  const folder=currentWorkspaceFolder(); if(!folder)return undefined;
  const filRouge=vscode.Uri.joinPath(folder.uri,'.filrouge');
  const displayPath=await isDirectory(filRouge)?'.filrouge/council/shared-context-graph.json':'.pets-council/shared-context-graph.json';
  return { uri:vscode.Uri.joinPath(folder.uri,...displayPath.split('/')),displayPath };
}
async function readGraph(uri:vscode.Uri):Promise<SharedContextGraph>{try{return parseContextGraph(JSON.parse(decoder.decode(await vscode.workspace.fs.readFile(uri))) as unknown);}catch{return emptyContextGraph();}}
async function readConfiguredSources():Promise<readonly {path:string;content:string}[]>{
  const folder=currentWorkspaceFolder();if(!folder)return[];const sources:{path:string;content:string}[]=[];
  for(const path of SOURCE_PATHS){const uri=vscode.Uri.joinPath(folder.uri,...path.split('/'));try{const bytes=await vscode.workspace.fs.readFile(uri);sources.push({path,content:bytes.byteLength>MAX_SOURCE_BYTES?`${decoder.decode(bytes.slice(0,MAX_SOURCE_BYTES))}\n[truncated]`:decoder.decode(bytes)});}catch{/* optional */}}
  return sources;
}
function currentWorkspaceFolder():vscode.WorkspaceFolder|undefined{const activeUri=vscode.window.activeTextEditor?.document.uri;return(activeUri?vscode.workspace.getWorkspaceFolder(activeUri):undefined)??vscode.workspace.workspaceFolders?.[0];}
async function exists(uri:vscode.Uri):Promise<boolean>{try{await vscode.workspace.fs.stat(uri);return true;}catch{return false;}}
async function isDirectory(uri:vscode.Uri):Promise<boolean>{try{return((await vscode.workspace.fs.stat(uri)).type&vscode.FileType.Directory)!==0;}catch{return false;}}
function parentUri(uri:vscode.Uri):vscode.Uri{const segments=uri.path.split('/').filter(Boolean);segments.pop();return uri.with({path:`/${segments.join('/')}`});}

import * as vscode from 'vscode';
import type { CouncilSuggestion, CouncilTurn } from '../domain';
import { parseUsageSignalLine, type SuggestionUsageAction, type SuggestionUsageSignal } from './usageSignals';

export type { SuggestionUsageAction } from './usageSignals';

const encoder=new TextEncoder();
const decoder=new TextDecoder();
const MAX_SIGNALS=500;
const MAX_BYTES=256*1024;

export class SuggestionUsageSignalStore{
  async record(turn:CouncilTurn,suggestion:CouncilSuggestion,action:SuggestionUsageAction,provider:SuggestionUsageSignal['provider']='unknown'):Promise<string>{
    const location=await resolveLocation();
    if(!location)throw new Error('Open a folder or workspace before recording suggestion usage.');
    const signal:SuggestionUsageSignal={version:1,recordedAt:new Date().toISOString(),action,turnId:turn.turnId,suggestionId:suggestion.id,role:suggestion.role,title:suggestion.title.slice(0,180),provider};
    const existing=await readLines(location.uri);
    const lines=[...existing,JSON.stringify(signal)].slice(-MAX_SIGNALS);
    await vscode.workspace.fs.createDirectory(parentUri(location.uri));
    await vscode.workspace.fs.writeFile(location.uri,encoder.encode(`${lines.join('\n')}\n`));
    return location.displayPath;
  }

  async open():Promise<void>{
    const location=await resolveLocation();
    if(!location){void vscode.window.showInformationMessage('Open a folder or workspace before opening suggestion usage signals.');return;}
    if(!(await exists(location.uri))){void vscode.window.showInformationMessage('No local suggestion usage signal has been recorded yet.');return;}
    const document=await vscode.workspace.openTextDocument(location.uri);
    await vscode.window.showTextDocument(document,{preview:false});
  }
}

async function resolveLocation():Promise<{uri:vscode.Uri;displayPath:string}|undefined>{
  const activeUri=vscode.window.activeTextEditor?.document.uri;
  const folder=(activeUri?vscode.workspace.getWorkspaceFolder(activeUri):undefined)??vscode.workspace.workspaceFolders?.[0];
  if(!folder)return undefined;
  const filRouge=vscode.Uri.joinPath(folder.uri,'.filrouge');
  const displayPath=await isDirectory(filRouge)?'.filrouge/council/usage-signals.jsonl':'.pets-council/usage-signals.jsonl';
  return{uri:vscode.Uri.joinPath(folder.uri,...displayPath.split('/')),displayPath};
}
async function readLines(uri:vscode.Uri):Promise<readonly string[]>{try{const bytes=await vscode.workspace.fs.readFile(uri);const bounded=bytes.byteLength>MAX_BYTES?bytes.slice(bytes.byteLength-MAX_BYTES):bytes;return decoder.decode(bounded).split(/\r?\n/).map((line)=>line.trim()).filter((line)=>Boolean(parseUsageSignalLine(line)));}catch{return[];}}
async function exists(uri:vscode.Uri):Promise<boolean>{try{await vscode.workspace.fs.stat(uri);return true;}catch{return false;}}
async function isDirectory(uri:vscode.Uri):Promise<boolean>{try{return((await vscode.workspace.fs.stat(uri)).type&vscode.FileType.Directory)!==0;}catch{return false;}}
function parentUri(uri:vscode.Uri):vscode.Uri{const segments=uri.path.split('/').filter(Boolean);segments.pop();return uri.with({path:`/${segments.join('/')}`});}

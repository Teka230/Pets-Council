import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';
import { CodexCouncilProvider, DeterministicCouncilProvider, emptyReviewForState, idleCouncilState, reviewingCouncilState } from './council/provider';
import { findCouncilTimelineSuggestion, upsertCouncilTurnReview, type CouncilTurnReviewEntry } from './council/reviewTimeline';
import type { CouncilReview, CouncilReviewState, CouncilSuggestion, CouncilTurn } from './domain';
import { SharedContextGraphStore } from './memory/contextGraphStore';
import { SuggestionUsageSignalStore, type SuggestionUsageAction } from './memory/usageSignalStore';
import { buildPetSnapshots, type PetMotionPreference } from './pets/petPack';
import { NativeOverlayBridge } from './pets/nativeOverlayBridge';
import { buildCouncilTurnFromCompletedCodexTurn } from './runtime/councilBridge';
import { projectConversationHistory, type ConversationHistoryState } from './runtime/conversationHistory';
import { CodexRuntimeService, resolveCodexBinary } from './runtime/service';
import { CodexSessionStore, createWorkspaceSessionKey } from './runtime/sessionStore';
import { createStdioCodexTransport } from './runtime/stdioTransport';
import type { CodexApprovalDecision } from './runtime/types';
import { renderCouncilHtml } from './webview';
import { captureLiveCouncilTurn } from './workspaceContext';

type ValueMessage=Readonly<{type:'copyPrompt'|'startCodexTurn';value:string}>;
type ApprovalMessage=Readonly<{type:'respondCodexApproval';decision:CodexApprovalDecision}>;
type SaveSuggestionMessage=Readonly<{type:'saveCouncilSuggestion';suggestionId:string}>;
type UsageSignalMessage=Readonly<{type:'recordSuggestionSignal';suggestionId:string;action:SuggestionUsageAction}>;
type ModelSelectionMessage=Readonly<{type:'setCodexModel';model:string;modelProvider?:string}|{type:'setCodexEffort';effort?:string}>;
type SimpleMessage=Readonly<{type:'refreshContext'|'openFolder'|'connectCodex'|'disconnectCodex'|'startCodexThread'|'resumeCodexThread'|'interruptCodexTurn'|'openContextGraph'|'openUsageSignals'}>;
type CouncilWebviewMessage=ValueMessage|ApprovalMessage|SaveSuggestionMessage|UsageSignalMessage|ModelSelectionMessage|SimpleMessage;

export function activate(context:vscode.ExtensionContext):void{
  const runtime=new CodexRuntimeService(resolveCodexBinary(readConfiguredCodexBinary()),createStdioCodexTransport);
  const sessionStore=new CodexSessionStore(context.workspaceState),graphStore=new SharedContextGraphStore(),usageStore=new SuggestionUsageSignalStore(),nativeOverlay=new NativeOverlayBridge();
  let sessionKey=currentWorkspaceSessionKey(),persistedThreadId=sessionStore.load(sessionKey)?.threadId;
  runtime.setResumeCandidate(sessionStore.load(sessionKey));

  const persistenceSubscription=runtime.onDidChange((status)=>{const threadId=status.thread.thread?.id;if(status.thread.phase!=='ready'||!threadId||threadId===persistedThreadId)return;persistedThreadId=threadId;void sessionStore.save(sessionKey,threadId).then((candidate)=>runtime.setResumeCandidate(candidate));});
  const workspaceSubscription=vscode.workspace.onDidChangeWorkspaceFolders(()=>{if(runtime.status.thread.phase==='ready')return;sessionKey=currentWorkspaceSessionKey();const candidate=sessionStore.load(sessionKey);persistedThreadId=candidate?.threadId;runtime.setResumeCandidate(candidate);});
  const commands=[
    vscode.commands.registerCommand('petsCouncil.openCouncil',()=>showCouncilPanel(runtime,graphStore,usageStore,nativeOverlay)),
    vscode.commands.registerCommand('petsCouncil.openContextGraph',()=>graphStore.open()),
    vscode.commands.registerCommand('petsCouncil.addOpenQuestion',()=>graphStore.addOpenQuestion()),
    vscode.commands.registerCommand('petsCouncil.resolveOpenQuestion',()=>graphStore.resolveOpenQuestion()),
    vscode.commands.registerCommand('petsCouncil.queryContextGraph',()=>graphStore.query()),
    vscode.commands.registerCommand('petsCouncil.supersedeDecision',()=>graphStore.supersedeDecision()),
    vscode.commands.registerCommand('petsCouncil.openUsageSignals',()=>usageStore.open())
  ];
  const configurationSubscription=vscode.workspace.onDidChangeConfiguration((event)=>{
    if(event.affectsConfiguration('petsCouncil.codexBinary'))runtime.setBinary(resolveCodexBinary(readConfiguredCodexBinary()));
    if(event.affectsConfiguration('petsCouncil.petMotion'))nativeOverlay.invalidate();
  });
  context.subscriptions.push(...commands,configurationSubscription,workspaceSubscription,persistenceSubscription,{dispose:()=>runtime.dispose()});
}

export function deactivate():void{/* ExtensionContext disposes shared services. */}

function showCouncilPanel(runtime:CodexRuntimeService,graphStore:SharedContextGraphStore,usageStore:SuggestionUsageSignalStore,nativeOverlay:NativeOverlayBridge):void{
  const panel=vscode.window.createWebviewPanel('petsCouncil.panel','Pets Council',vscode.ViewColumn.Beside,{enableScripts:true,retainContextWhenHidden:true});
  const deterministic=new DeterministicCouncilProvider(),intelligent=new CodexCouncilProvider(runtime,deterministic);
  let disposed=false,renderSequence=0,reviewSequence=0,currentTurn:CouncilTurn|undefined,currentReview:CouncilReview|undefined,councilState:CouncilReviewState=idleCouncilState(),lastBridgedTurnId:string|undefined;
  let conversationHistory:ConversationHistoryState={turns:[]};
  let reviewTimeline:readonly CouncilTurnReviewEntry[]=[];

  const syncConversation=():void=>{conversationHistory=projectConversationHistory(conversationHistory,runtime.status);};
  const renderCurrent=():void=>{
    if(disposed||!currentTurn||!currentReview)return;
    syncConversation();
    const pets=buildPetSnapshots(currentReview,councilState,runtime.status);
    panel.webview.html=renderCouncilHtml(currentTurn,currentReview,councilState,runtime.status,pets,conversationHistory.turns,reviewTimeline,readPetMotionPreference(),createNonce());
    void nativeOverlay.publish({visible:true,companions:pets});
  };
  const reviewCompletedTurn=async(turn:CouncilTurn):Promise<void>=>{
    const sequence=++reviewSequence;
    currentReview=emptyReviewForState(turn.turnId);councilState=reviewingCouncilState(turn.turnId);
    reviewTimeline=upsertCouncilTurnReview(reviewTimeline,{turn,review:currentReview,state:councilState});
    renderCurrent();
    const outcome=await intelligent.review(turn,currentWorkspaceDirectory());
    if(disposed||sequence!==reviewSequence||currentTurn?.turnId!==turn.turnId)return;
    currentReview=outcome.review;councilState=outcome.state;
    reviewTimeline=upsertCouncilTurnReview(reviewTimeline,{turn,review:outcome.review,state:outcome.state});
    renderCurrent();
  };
  const bridgeCompletedTurn=():boolean=>{
    if(!currentTurn)return false;const bridged=buildCouncilTurnFromCompletedCodexTurn(currentTurn,runtime.status);
    if(!bridged||bridged.turnId===lastBridgedTurnId)return false;
    currentTurn=bridged;lastBridgedTurnId=bridged.turnId;void reviewCompletedTurn(bridged);return true;
  };
  const refreshContext=async():Promise<void>=>{
    const sequence=++renderSequence;panel.webview.html=renderLoadingHtml(createNonce());
    const[captured,actorContexts]=await Promise.all([captureLiveCouncilTurn(),graphStore.projectAll()]);
    if(disposed||sequence!==renderSequence)return;
    currentTurn={...captured,projectContext:actorContexts.codex,actorContexts};const outcome=await deterministic.review(currentTurn);currentReview=outcome.review;councilState=outcome.state;if(!bridgeCompletedTurn())renderCurrent();
  };
  const resolveSuggestion=(suggestionId:string):{turn:CouncilTurn;suggestion:CouncilSuggestion;provider:CouncilReviewState['provider']}|undefined=>{
    const historical=findCouncilTimelineSuggestion(reviewTimeline,suggestionId);
    if(historical)return{turn:historical.entry.turn,suggestion:historical.suggestion,provider:historical.entry.state.provider};
    if(!currentTurn||!currentReview)return undefined;const suggestion=findSuggestion(currentReview,suggestionId);return suggestion?{turn:currentTurn,suggestion,provider:councilState.provider}:undefined;
  };
  const saveSuggestion=async(suggestionId:string):Promise<void>=>{
    const resolved=resolveSuggestion(suggestionId);if(!resolved)return;
    try{const projectContext=await graphStore.recordSuggestion(resolved.turn,resolved.suggestion);if(currentTurn?.turnId===resolved.turn.turnId)currentTurn={...currentTurn,projectContext};councilState={...councilState,message:`Saved “${resolved.suggestion.title}” to the Shared Context Graph.`};renderCurrent();void vscode.window.showInformationMessage(`Council proposal saved to ${projectContext.storagePath??'the Shared Context Graph'}.`);}catch(error){void vscode.window.showErrorMessage(error instanceof Error?error.message:String(error));}
  };
  const recordUsage=async(suggestionId:string,action:SuggestionUsageAction):Promise<void>=>{
    const resolved=resolveSuggestion(suggestionId);if(!resolved)return;
    try{await usageStore.record(resolved.turn,resolved.suggestion,action,resolved.provider);}catch(error){void vscode.window.showErrorMessage(error instanceof Error?error.message:String(error));}
  };

  const runtimeSubscription=runtime.onDidChange(()=>{syncConversation();if(!bridgeCompletedTurn())renderCurrent();});
  const messageSubscription=panel.webview.onDidReceiveMessage(async(message:unknown)=>{
    if(!isCouncilWebviewMessage(message))return;
    switch(message.type){
      case'refreshContext':await refreshContext();return;
      case'openFolder':await openFolderFromCouncil();return;
      case'connectCodex':await runtime.connect();return;
      case'disconnectCodex':runtime.disconnect();return;
      case'startCodexThread':await runtime.startThread(currentWorkspaceDirectory());return;
      case'resumeCodexThread':await runtime.resumeThread(undefined,currentWorkspaceDirectory());return;
      case'startCodexTurn':await runtime.startTurn(message.value,currentWorkspaceDirectory());return;
      case'interruptCodexTurn':await runtime.interruptTurn();return;
      case'setCodexModel':runtime.setModelSelection({model:message.model,modelProvider:message.modelProvider});return;
      case'setCodexEffort':runtime.setModelSelection({effort:message.effort});return;
      case'respondCodexApproval':runtime.respondApproval(message.decision);return;
      case'saveCouncilSuggestion':await saveSuggestion(message.suggestionId);return;
      case'recordSuggestionSignal':await recordUsage(message.suggestionId,message.action);return;
      case'openContextGraph':await graphStore.open();return;
      case'openUsageSignals':await usageStore.open();return;
      case'copyPrompt':{const prompt=message.value.trim();if(!prompt)return;await vscode.env.clipboard.writeText(prompt);void vscode.window.showInformationMessage('Council prompt copied. Nothing was executed.');}
    }
  });
  panel.onDidDispose(()=>{disposed=true;++reviewSequence;runtimeSubscription.dispose();messageSubscription.dispose();void nativeOverlay.hide();});
  void refreshContext();
}

function findSuggestion(review:CouncilReview,suggestionId:string):CouncilSuggestion|undefined{for(const role of review.roles){const suggestion=role.suggestions.find((candidate)=>candidate.id===suggestionId);if(suggestion)return suggestion;}return undefined;}
async function openFolderFromCouncil():Promise<void>{const selected=await vscode.window.showOpenDialog({canSelectFiles:false,canSelectFolders:true,canSelectMany:false,openLabel:'Open folder',title:'Open a project for Pets Council'});const folder=selected?.[0];if(folder)await vscode.commands.executeCommand('vscode.openFolder',folder);}
function currentWorkspaceDirectory():string|undefined{const activeUri=vscode.window.activeTextEditor?.document.uri,activeFolder=activeUri?vscode.workspace.getWorkspaceFolder(activeUri):undefined;return activeFolder?.uri.fsPath??vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;}
function currentWorkspaceSessionKey():string{return createWorkspaceSessionKey((vscode.workspace.workspaceFolders??[]).map((folder)=>folder.uri.toString()));}
function readConfiguredCodexBinary():string|undefined{return vscode.workspace.getConfiguration('petsCouncil').get<string>('codexBinary');}
function readPetMotionPreference():PetMotionPreference{return vscode.workspace.getConfiguration('petsCouncil').get<PetMotionPreference>('petMotion','system');}
function isCouncilWebviewMessage(message:unknown):message is CouncilWebviewMessage{
  if(typeof message!=='object'||message===null)return false;const candidate=message as{type?:unknown;value?:unknown;decision?:unknown;suggestionId?:unknown;action?:unknown;model?:unknown;modelProvider?:unknown;effort?:unknown};
  if(['refreshContext','openFolder','connectCodex','disconnectCodex','startCodexThread','resumeCodexThread','interruptCodexTurn','openContextGraph','openUsageSignals'].includes(String(candidate.type)))return true;
  if((candidate.type==='setCodexModel'&&typeof candidate.model==='string')||(candidate.type==='setCodexEffort'&&(candidate.effort===undefined||typeof candidate.effort==='string')))return true;
  if((candidate.type==='copyPrompt'||candidate.type==='startCodexTurn')&&typeof candidate.value==='string')return true;
  if(candidate.type==='saveCouncilSuggestion'&&typeof candidate.suggestionId==='string')return true;
  if(candidate.type==='recordSuggestionSignal'&&typeof candidate.suggestionId==='string'&&['accepted','dismissed','snoozed'].includes(String(candidate.action)))return true;
  return candidate.type==='respondCodexApproval'&&(candidate.decision==='accept'||candidate.decision==='decline');
}
function createNonce():string{return randomBytes(18).toString('base64');}
function renderLoadingHtml(nonce:string):string{return`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'"><title>Pets Council</title><style>:root{color-scheme:light dark;font-family:var(--vscode-font-family)}body{padding:32px;color:var(--vscode-foreground);background:var(--vscode-editor-background)}</style></head><body><h1>Projecting shared context…</h1><p>Reading bounded editor, Git, roadmap, Fil Rouge, actor projections, and Shared Context Graph sources locally.</p></body></html>`;}

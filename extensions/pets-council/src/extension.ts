import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';
import { CodexCouncilProvider, DeterministicCouncilProvider, emptyReviewForState, idleCouncilState, reviewingCouncilState } from './council/provider';
import { findCouncilTimelineSuggestion, upsertCouncilTurnReview, type CouncilTurnReviewEntry } from './council/reviewTimeline';
import { CouncilReviewTimelineStore } from './council/reviewTimelineStore';
import { SilenceTunedCouncilProvider } from './council/silenceTunedProvider';
import type { CouncilReview, CouncilReviewState, CouncilSuggestion, CouncilTurn } from './domain';
import { SharedContextGraphStore } from './memory/contextGraphStore';
import { openCompanionSilenceReport } from './memory/silenceTuningView';
import { SuggestionUsageSignalStore, type SuggestionUsageAction } from './memory/usageSignalStore';
import { BUILTIN_PET_PACK, buildPetSnapshots, type PetMotionPreference, type PetPackManifest } from './pets/petPack';
import { parsePetPackJson } from './pets/petPackInstallation';
import { ExternalPetPackStore } from './pets/petPackStore';
import { NativeOverlayBridge } from './pets/nativeOverlayBridge';
import { buildCouncilTurnFromCompletedCodexTurn } from './runtime/councilBridge';
import { projectConversationHistory, type ConversationHistoryState } from './runtime/conversationHistory';
import { CodexRuntimeService, resolveCodexBinary } from './runtime/service';
import { CodexSessionBrowserService } from './runtime/sessionBrowserService';
import { CodexSessionBrowserStore } from './runtime/sessionBrowserStore';
import { sessionDisplayName, type CodexThreadSummary } from './runtime/sessionCatalog';
import { CodexSessionStore, createWorkspaceSessionKey } from './runtime/sessionStore';
import { createStdioCodexTransport } from './runtime/stdioTransport';
import type { CodexApprovalDecision } from './runtime/types';
import { renderCouncilHtml } from './webview';
import { captureLiveCouncilTurn } from './workspaceContext';
import { createProductLayoutState, shouldOfferProductLayout } from './workbench/productLayout';

type ValueMessage=Readonly<{type:'copyPrompt'|'startCodexTurn';value:string}>;
type ApprovalMessage=Readonly<{type:'respondCodexApproval';decision:CodexApprovalDecision}>;
type SaveSuggestionMessage=Readonly<{type:'saveCouncilSuggestion';suggestionId:string}>;
type UsageSignalMessage=Readonly<{type:'recordSuggestionSignal';suggestionId:string;action:SuggestionUsageAction}>;
type ModelSelectionMessage=Readonly<{type:'setCodexModel';model:string;modelProvider?:string}|{type:'setCodexEffort';effort?:string}>;
type SimpleMessage=Readonly<{type:'refreshContext'|'openFolder'|'connectCodex'|'disconnectCodex'|'startCodexThread'|'resumeCodexThread'|'interruptCodexTurn'|'openContextGraph'|'openUsageSignals'|'browseCodexSessions'|'applyProductLayout'}>;
type CouncilWebviewMessage=ValueMessage|ApprovalMessage|SaveSuggestionMessage|UsageSignalMessage|ModelSelectionMessage|SimpleMessage;
type SessionQuickPickItem=vscode.QuickPickItem&Readonly<{sessionAction:'new'|'thread';thread?:CodexThreadSummary}>;
const PRODUCT_LAYOUT_KEY='petsCouncil.productLayout';

export function activate(context:vscode.ExtensionContext):void{
  const runtime=new CodexRuntimeService(resolveCodexBinary(readConfiguredCodexBinary()),createStdioCodexTransport);
  const sessionStore=new CodexSessionStore(context.workspaceState),sessionBrowserStore=new CodexSessionBrowserStore(context.workspaceState),sessionBrowser=new CodexSessionBrowserService(()=>runtime.status.binary,createStdioCodexTransport),reviewTimelineStore=new CouncilReviewTimelineStore(context.workspaceState),petPackStore=new ExternalPetPackStore(context.globalStorageUri,context.workspaceState),graphStore=new SharedContextGraphStore(),usageStore=new SuggestionUsageSignalStore(),nativeOverlay=new NativeOverlayBridge();
  let sessionKey=currentWorkspaceSessionKey(),persistedThreadId=sessionStore.load(sessionKey)?.threadId,activePetPack:PetPackManifest=BUILTIN_PET_PACK;
  runtime.setResumeCandidate(sessionStore.load(sessionKey));void petPackStore.load(sessionKey).then((pack)=>{activePetPack=pack??BUILTIN_PET_PACK;});

  const openCouncil=():void=>{showCouncilPanel(runtime,graphStore,usageStore,nativeOverlay,()=>activePetPack,reviewTimelineStore,()=>sessionKey);void offerProductLayout(context);};
  const persistenceSubscription=runtime.onDidChange((status)=>{const threadId=status.thread.thread?.id;if(status.thread.phase!=='ready'||!threadId||threadId===persistedThreadId)return;persistedThreadId=threadId;void sessionStore.save(sessionKey,threadId).then((candidate)=>runtime.setResumeCandidate(candidate));});
  const workspaceSubscription=vscode.workspace.onDidChangeWorkspaceFolders(()=>{if(runtime.status.thread.phase!=='ready'){sessionKey=currentWorkspaceSessionKey();const candidate=sessionStore.load(sessionKey);persistedThreadId=candidate?.threadId;runtime.setResumeCandidate(candidate);}void petPackStore.load(sessionKey).then((pack)=>{activePetPack=pack??BUILTIN_PET_PACK;nativeOverlay.invalidate();});});
  const commands=[
    vscode.commands.registerCommand('petsCouncil.openCouncil',openCouncil),vscode.commands.registerCommand('petsCouncil.applyProductLayout',()=>applyProductLayout(context,openCouncil)),vscode.commands.registerCommand('petsCouncil.browseCodexSessions',()=>browseCodexSessions(runtime,sessionBrowser,sessionBrowserStore,sessionKey)),
    vscode.commands.registerCommand('petsCouncil.installPetPack',()=>installPetPack(petPackStore,sessionKey,(pack)=>{activePetPack=pack;nativeOverlay.invalidate();openCouncil();})),vscode.commands.registerCommand('petsCouncil.restoreBuiltinPetPack',async()=>{await petPackStore.restoreBuiltin(sessionKey);activePetPack=BUILTIN_PET_PACK;nativeOverlay.invalidate();void vscode.window.showInformationMessage('Built-in Pets Council companions restored.');openCouncil();}),
    vscode.commands.registerCommand('petsCouncil.openSilenceTuningReport',()=>openCompanionSilenceReport(usageStore)),vscode.commands.registerCommand('petsCouncil.openContextGraph',()=>graphStore.open()),vscode.commands.registerCommand('petsCouncil.addOpenQuestion',()=>graphStore.addOpenQuestion()),vscode.commands.registerCommand('petsCouncil.resolveOpenQuestion',()=>graphStore.resolveOpenQuestion()),vscode.commands.registerCommand('petsCouncil.queryContextGraph',()=>graphStore.query()),vscode.commands.registerCommand('petsCouncil.supersedeDecision',()=>graphStore.supersedeDecision()),vscode.commands.registerCommand('petsCouncil.openUsageSignals',()=>usageStore.open())
  ];
  const configurationSubscription=vscode.workspace.onDidChangeConfiguration((event)=>{if(event.affectsConfiguration('petsCouncil.codexBinary'))runtime.setBinary(resolveCodexBinary(readConfiguredCodexBinary()));if(event.affectsConfiguration('petsCouncil.petMotion'))nativeOverlay.invalidate();});
  context.subscriptions.push(...commands,configurationSubscription,workspaceSubscription,persistenceSubscription,{dispose:()=>runtime.dispose()});
}

export function deactivate():void{/* ExtensionContext disposes shared services. */}

function showCouncilPanel(runtime:CodexRuntimeService,graphStore:SharedContextGraphStore,usageStore:SuggestionUsageSignalStore,nativeOverlay:NativeOverlayBridge,petPack:()=>PetPackManifest,reviewTimelineStore:CouncilReviewTimelineStore,workspaceKey:()=>string):void{
  const panel=vscode.window.createWebviewPanel('petsCouncil.panel','Pets Council',vscode.ViewColumn.Beside,{enableScripts:true,retainContextWhenHidden:true});const deterministic=new DeterministicCouncilProvider(),intelligent=new SilenceTunedCouncilProvider(new CodexCouncilProvider(runtime,deterministic),usageStore,readSilenceTuningEnabled);
  let disposed=false,renderSequence=0,reviewSequence=0,currentTurn:CouncilTurn|undefined,currentReview:CouncilReview|undefined,councilState:CouncilReviewState=idleCouncilState(),lastBridgedTurnId:string|undefined;let conversationHistory:ConversationHistoryState={turns:[]};let reviewTimeline:readonly CouncilTurnReviewEntry[]=reviewTimelineStore.load(workspaceKey());
  const persistReviews=():void=>{void reviewTimelineStore.save(workspaceKey(),reviewTimeline);};
  const syncConversation=():void=>{conversationHistory=projectConversationHistory(conversationHistory,runtime.status);};
  const renderCurrent=():void=>{if(disposed||!currentTurn||!currentReview)return;syncConversation();const pets=buildPetSnapshots(currentReview,councilState,runtime.status,petPack());panel.webview.html=renderCouncilHtml(currentTurn,currentReview,councilState,runtime.status,pets,conversationHistory.turns,reviewTimeline,readPetMotionPreference(),createNonce());void nativeOverlay.publish({visible:true,companions:pets});};
  const reviewCompletedTurn=async(turn:CouncilTurn):Promise<void>=>{const sequence=++reviewSequence;currentReview=emptyReviewForState(turn.turnId);councilState=reviewingCouncilState(turn.turnId);reviewTimeline=upsertCouncilTurnReview(reviewTimeline,{turn,review:currentReview,state:councilState});renderCurrent();const outcome=await intelligent.review(turn,currentWorkspaceDirectory());if(disposed||sequence!==reviewSequence||currentTurn?.turnId!==turn.turnId)return;currentReview=outcome.review;councilState=outcome.state;reviewTimeline=upsertCouncilTurnReview(reviewTimeline,{turn,review:outcome.review,state:outcome.state});persistReviews();renderCurrent();};
  const bridgeCompletedTurn=():boolean=>{if(!currentTurn)return false;const bridged=buildCouncilTurnFromCompletedCodexTurn(currentTurn,runtime.status);if(!bridged||bridged.turnId===lastBridgedTurnId)return false;currentTurn=bridged;lastBridgedTurnId=bridged.turnId;void reviewCompletedTurn(bridged);return true;};
  const refreshContext=async():Promise<void>=>{const sequence=++renderSequence;panel.webview.html=renderLoadingHtml(createNonce());const[captured,actorContexts]=await Promise.all([captureLiveCouncilTurn(),graphStore.projectAll()]);if(disposed||sequence!==renderSequence)return;currentTurn={...captured,projectContext:actorContexts.codex,actorContexts};const outcome=await deterministic.review(currentTurn);currentReview=outcome.review;councilState=outcome.state;if(!bridgeCompletedTurn())renderCurrent();};
  const resolveSuggestion=(suggestionId:string):{turn:CouncilTurn;suggestion:CouncilSuggestion;provider:CouncilReviewState['provider']}|undefined=>{const historical=findCouncilTimelineSuggestion(reviewTimeline,suggestionId);if(historical)return{turn:historical.entry.turn,suggestion:historical.suggestion,provider:historical.entry.state.provider};if(!currentTurn||!currentReview)return undefined;const suggestion=findSuggestion(currentReview,suggestionId);return suggestion?{turn:currentTurn,suggestion,provider:councilState.provider}:undefined;};
  const saveSuggestion=async(suggestionId:string):Promise<void>=>{const resolved=resolveSuggestion(suggestionId);if(!resolved)return;try{const projectContext=await graphStore.recordSuggestion(resolved.turn,resolved.suggestion);if(currentTurn?.turnId===resolved.turn.turnId)currentTurn={...currentTurn,projectContext};councilState={...councilState,message:`Saved “${resolved.suggestion.title}” to the Shared Context Graph.`};renderCurrent();void vscode.window.showInformationMessage(`Council proposal saved to ${projectContext.storagePath??'the Shared Context Graph'}.`);}catch(error){void vscode.window.showErrorMessage(error instanceof Error?error.message:String(error));}};
  const recordUsage=async(suggestionId:string,action:SuggestionUsageAction):Promise<void>=>{const resolved=resolveSuggestion(suggestionId);if(!resolved)return;try{await usageStore.record(resolved.turn,resolved.suggestion,action,resolved.provider);}catch(error){void vscode.window.showErrorMessage(error instanceof Error?error.message:String(error));}};
  const runtimeSubscription=runtime.onDidChange(()=>{syncConversation();if(!bridgeCompletedTurn())renderCurrent();});
  const messageSubscription=panel.webview.onDidReceiveMessage(async(message:unknown)=>{if(!isCouncilWebviewMessage(message))return;switch(message.type){case'refreshContext':await refreshContext();return;case'openFolder':await openFolderFromCouncil();return;case'connectCodex':await runtime.connect();return;case'disconnectCodex':runtime.disconnect();return;case'startCodexThread':await runtime.startThread(currentWorkspaceDirectory());return;case'resumeCodexThread':await runtime.resumeThread(undefined,currentWorkspaceDirectory());return;case'startCodexTurn':await runtime.startTurn(message.value,currentWorkspaceDirectory());return;case'interruptCodexTurn':await runtime.interruptTurn();return;case'setCodexModel':runtime.setModelSelection({model:message.model,modelProvider:message.modelProvider});return;case'setCodexEffort':runtime.setModelSelection({effort:message.effort});return;case'respondCodexApproval':runtime.respondApproval(message.decision);return;case'saveCouncilSuggestion':await saveSuggestion(message.suggestionId);return;case'recordSuggestionSignal':await recordUsage(message.suggestionId,message.action);return;case'openContextGraph':await graphStore.open();return;case'openUsageSignals':await usageStore.open();return;case'browseCodexSessions':await vscode.commands.executeCommand('petsCouncil.browseCodexSessions');return;case'applyProductLayout':await vscode.commands.executeCommand('petsCouncil.applyProductLayout');return;case'copyPrompt':{const prompt=message.value.trim();if(!prompt)return;await vscode.env.clipboard.writeText(prompt);void vscode.window.showInformationMessage('Council prompt copied. Nothing was executed.');}}});
  panel.onDidDispose(()=>{disposed=true;++reviewSequence;runtimeSubscription.dispose();messageSubscription.dispose();void nativeOverlay.hide();});void refreshContext();
}

async function installPetPack(store:ExternalPetPackStore,workspaceKey:string,activate:(pack:PetPackManifest)=>void):Promise<void>{const selected=await vscode.window.showOpenDialog({canSelectFiles:false,canSelectFolders:true,canSelectMany:false,openLabel:'Select Pet Pack',title:'Select a folder containing pet-pack.json'});const folder=selected?.[0];if(!folder)return;try{const text=new TextDecoder().decode(await vscode.workspace.fs.readFile(vscode.Uri.joinPath(folder,'pet-pack.json')));const parsed=parsePetPackJson(text);if(!parsed.manifest)throw new Error(parsed.errors.join('\n'));const pack=parsed.manifest;const choice=await vscode.window.showInformationMessage(`Install “${pack.name}” ${pack.version} with ${pack.pets.length} pets?`,'Install');if(choice!=='Install')return;activate(await store.install(workspaceKey,folder));void vscode.window.showInformationMessage(`Pet Pack “${pack.name}” installed for this workspace.`);}catch(error){void vscode.window.showErrorMessage(`Pet Pack installation failed: ${error instanceof Error?error.message:String(error)}`);}}
async function offerProductLayout(context:vscode.ExtensionContext):Promise<void>{if(!shouldOfferProductLayout(context.globalState.get(PRODUCT_LAYOUT_KEY)))return;const choice=await vscode.window.showInformationMessage('Use the Pets Council product layout? This closes the auxiliary Chat bar once and keeps Pets Council as the primary surface.','Apply layout','Keep current layout');if(choice==='Apply layout')await vscode.commands.executeCommand('petsCouncil.applyProductLayout');else if(choice==='Keep current layout')await context.globalState.update(PRODUCT_LAYOUT_KEY,createProductLayoutState());}
async function applyProductLayout(context:vscode.ExtensionContext,openCouncil:()=>void):Promise<void>{try{await vscode.commands.executeCommand('workbench.action.closeAuxiliaryBar');}catch{/* Host may not expose an auxiliary bar. */}await context.globalState.update(PRODUCT_LAYOUT_KEY,createProductLayoutState());openCouncil();}
async function browseCodexSessions(runtime:CodexRuntimeService,browser:CodexSessionBrowserService,store:CodexSessionBrowserStore,workspaceKey:string):Promise<void>{
  if(runtime.status.phase!=='ready'){
    const connect=await vscode.window.showInformationMessage('Connect Codex before browsing workspace sessions.','Connect Codex');
    if(connect!=='Connect Codex')return;
    await runtime.connect();
  }
  if(runtime.status.phase!=='ready')return;
  const threads=await browser.list(currentWorkspaceDirectory());
  const aliases=store.loadAliases(workspaceKey),activeId=runtime.status.thread.thread?.id;
  const items:SessionQuickPickItem[]=[
    {label:'$(add) New Codex session',description:'Start an empty explicit thread',sessionAction:'new'},
    ...threads.map((thread)=>({
      label:`${thread.id===activeId?'$(circle-filled)':'$(comment-discussion)'} ${sessionDisplayName(thread,aliases)}`,
      description:[thread.model,formatSessionDate(thread.recencyAt??thread.updatedAt??thread.createdAt)].filter(Boolean).join(' · '),
      detail:thread.cwd??thread.preview,
      sessionAction:'thread' as const,
      thread
    }))
  ];
  const selected=await vscode.window.showQuickPick(items,{title:'Pets Council — Workspace Codex sessions',placeHolder:'Choose a session or start a new one',matchOnDescription:true,matchOnDetail:true});
  if(!selected)return;
  if(selected.sessionAction==='new'){await runtime.startThread(currentWorkspaceDirectory());return;}
  const thread=selected.thread;if(!thread)return;
  const action=await vscode.window.showQuickPick(['Resume','Rename locally','Archive'] as const,{title:sessionDisplayName(thread,aliases),placeHolder:'Choose an explicit session action'});
  if(!action)return;
  if(action==='Resume'){await runtime.resumeThread(thread.id,currentWorkspaceDirectory());return;}
  if(action==='Rename locally'){
    const name=await vscode.window.showInputBox({title:'Rename Codex session locally',value:aliases[thread.id]??'',prompt:'Stored only in this workspace. Clear the field to restore the server preview.'});
    if(name!==undefined)await store.rename(workspaceKey,thread.id,name);
    return;
  }
  const confirmation=await vscode.window.showWarningMessage(`Archive “${sessionDisplayName(thread,aliases)}”?`,'Archive');
  if(confirmation==='Archive'){await browser.archive(thread.id);await store.forget(workspaceKey,thread.id);}
}
function findSuggestion(review:CouncilReview,suggestionId:string):CouncilSuggestion|undefined{for(const role of review.roles){const suggestion=role.suggestions.find((candidate)=>candidate.id===suggestionId);if(suggestion)return suggestion;}return undefined;}
async function openFolderFromCouncil():Promise<void>{const selected=await vscode.window.showOpenDialog({canSelectFiles:false,canSelectFolders:true,canSelectMany:false,openLabel:'Open folder',title:'Open a project for Pets Council'});const folder=selected?.[0];if(folder)await vscode.commands.executeCommand('vscode.openFolder',folder);}
function currentWorkspaceDirectory():string|undefined{const activeUri=vscode.window.activeTextEditor?.document.uri,activeFolder=activeUri?vscode.workspace.getWorkspaceFolder(activeUri):undefined;return activeFolder?.uri.fsPath??vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;}
function currentWorkspaceSessionKey():string{return createWorkspaceSessionKey((vscode.workspace.workspaceFolders??[]).map((folder)=>folder.uri.toString()));}
function readConfiguredCodexBinary():string|undefined{return vscode.workspace.getConfiguration('petsCouncil').get<string>('codexBinary');}
function readPetMotionPreference():PetMotionPreference{return vscode.workspace.getConfiguration('petsCouncil').get<PetMotionPreference>('petMotion','system');}
function readSilenceTuningEnabled():boolean{return vscode.workspace.getConfiguration('petsCouncil').get<boolean>('localSilence.enabled',false);}
function formatSessionDate(value:number|undefined):string|undefined{if(value===undefined)return undefined;const milliseconds=value<10_000_000_000?value*1000:value;return new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'short'}).format(new Date(milliseconds));}
function isCouncilWebviewMessage(message:unknown):message is CouncilWebviewMessage{if(typeof message!=='object'||message===null)return false;const candidate=message as{type?:unknown;value?:unknown;decision?:unknown;suggestionId?:unknown;action?:unknown;model?:unknown;modelProvider?:unknown;effort?:unknown};if(['refreshContext','openFolder','connectCodex','disconnectCodex','startCodexThread','resumeCodexThread','interruptCodexTurn','openContextGraph','openUsageSignals','browseCodexSessions','applyProductLayout'].includes(String(candidate.type)))return true;if((candidate.type==='setCodexModel'&&typeof candidate.model==='string')||(candidate.type==='setCodexEffort'&&(candidate.effort===undefined||typeof candidate.effort==='string')))return true;if((candidate.type==='copyPrompt'||candidate.type==='startCodexTurn')&&typeof candidate.value==='string')return true;if(candidate.type==='saveCouncilSuggestion'&&typeof candidate.suggestionId==='string')return true;if(candidate.type==='recordSuggestionSignal'&&typeof candidate.suggestionId==='string'&&['accepted','dismissed','snoozed'].includes(String(candidate.action)))return true;return candidate.type==='respondCodexApproval'&&(candidate.decision==='accept'||candidate.decision==='decline');}
function createNonce():string{return randomBytes(18).toString('base64');}
function renderLoadingHtml(nonce:string):string{return`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'"><title>Pets Council</title><style>:root{color-scheme:light dark;font-family:var(--vscode-font-family)}body{padding:32px;color:var(--vscode-foreground);background:var(--vscode-editor-background)}</style></head><body><h1>Projecting shared context…</h1><p>Reading bounded editor, Git, roadmap, Fil Rouge, actor projections, and Shared Context Graph sources locally.</p></body></html>`;}

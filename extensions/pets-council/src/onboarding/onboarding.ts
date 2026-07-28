import * as vscode from 'vscode';

export async function offerFirstRunOnboarding(context:vscode.ExtensionContext):Promise<void>{
  if(context.globalState.get<boolean>('petsCouncil.onboardingSeen'))return;
  await context.globalState.update('petsCouncil.onboardingSeen',true);
  const action=await vscode.window.showInformationMessage('Pets Council is ready. Open a project, verify Codex, then start an explicit session.','Open setup guide','Run diagnostics');
  if(action==='Open setup guide')openOnboarding();
  if(action==='Run diagnostics')await vscode.commands.executeCommand('petsCouncil.runDiagnostics');
}

export function openOnboarding():void{
  const panel=vscode.window.createWebviewPanel('petsCouncil.onboarding','Pets Council setup',vscode.ViewColumn.Beside,{enableScripts:true});
  panel.webview.html=html();
  const subscription=panel.webview.onDidReceiveMessage(async(message:unknown)=>{
    if(typeof message!=='object'||message===null)return;const type=String((message as{type?:unknown}).type);
    if(type==='openFolder'){const selected=await vscode.window.showOpenDialog({canSelectFiles:false,canSelectFolders:true,canSelectMany:false,openLabel:'Open project'});if(selected?.[0])await vscode.commands.executeCommand('vscode.openFolder',selected[0]);}
    if(type==='runDiagnostics')await vscode.commands.executeCommand('petsCouncil.runDiagnostics');
    if(type==='openCouncil')await vscode.commands.executeCommand('petsCouncil.openCouncil');
    if(type==='openSettings')await vscode.commands.executeCommand('workbench.action.openSettings','@ext:teka230.pets-council');
  });
  panel.onDidDispose(()=>subscription.dispose());
}

function html():string{return`<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none';style-src 'unsafe-inline';script-src 'unsafe-inline'"><title>Pets Council setup</title><style>:root{color-scheme:light dark;font-family:var(--vscode-font-family)}body{max-width:820px;margin:auto;padding:32px;color:var(--vscode-foreground);background:var(--vscode-editor-background)}h1{font-size:30px}.promise{font-size:18px}.steps{display:grid;gap:12px;margin:24px 0}.step{display:grid;grid-template-columns:40px 1fr;gap:12px;padding:16px;border:1px solid var(--vscode-panel-border);border-radius:12px;background:var(--vscode-sideBar-background)}.number{display:grid;place-items:center;width:32px;height:32px;border-radius:50%;background:var(--vscode-badge-background);color:var(--vscode-badge-foreground);font-weight:700}.buttons{display:flex;gap:10px;flex-wrap:wrap}button{padding:8px 12px;border:1px solid transparent;border-radius:6px;color:var(--vscode-button-foreground);background:var(--vscode-button-background);cursor:pointer}.secondary{color:var(--vscode-foreground);background:transparent;border-color:var(--vscode-panel-border)}small{color:var(--vscode-descriptionForeground)}</style></head><body><p>Pets Council Desktop Preview</p><h1>Codex answers. Your companions review. You decide.</h1><p class="promise">Nothing connects, sends, approves, or writes until you explicitly choose it.</p><div class="steps">${['Open a project folder','Run diagnostics and locate Codex','Open the Council','Connect Codex explicitly','Start or resume a session','Send one prompt and review the four perspectives'].map((label,index)=>`<div class="step"><span class="number">${index+1}</span><div><b>${label}</b><br><small>${detail(index)}</small></div></div>`).join('')}</div><div class="buttons"><button data-action="openFolder">Open project</button><button data-action="runDiagnostics">Run diagnostics</button><button data-action="openCouncil">Open Council</button><button class="secondary" data-action="openSettings">Settings</button></div><script>const vscode=acquireVsCodeApi();document.querySelectorAll('[data-action]').forEach(button=>button.addEventListener('click',()=>vscode.postMessage({type:button.dataset.action})));</script></body></html>`;}
function detail(index:number):string{return[
  'The workspace defines the local context and project-scoped memory.',
  'The probe checks the binary, overlay, Pet Pack, and storage without connecting.',
  'The Council remains quiet until useful project evidence exists.',
  'The handshake does not create a thread or send a prompt.',
  'Session restoration is always an explicit choice.',
  'Suggestions only fill the composer or become durable after your action.'
][index]??'';}

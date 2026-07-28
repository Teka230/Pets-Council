import { spawn } from 'node:child_process';
import * as vscode from 'vscode';
import { BUILTIN_PET_PACK, validatePetPack } from '../pets/petPack';
import { NATIVE_OVERLAY_UPDATE_COMMAND } from '../pets/nativeOverlayBridge';
import { resolveCodexBinary } from '../runtime/service';
import { renderDiagnosticReport, type DiagnosticCheck } from './diagnosticReport';

export async function runProductDiagnostics(configuredBinary?:string):Promise<readonly DiagnosticCheck[]>{
  const workspace=vscode.workspace.workspaceFolders?.length?{
    id:'workspace',label:'Workspace',status:'pass' as const,detail:`${vscode.workspace.workspaceFolders.length} workspace folder${vscode.workspace.workspaceFolders.length===1?' is':'s are'} open.`
  }:{id:'workspace',label:'Workspace',status:'warning' as const,detail:'No project folder is open.',nextAction:'Open a folder before asking the Council to review project context.'};

  const binary=resolveCodexBinary(configuredBinary);
  const codex=await probeCodex(binary);
  const commands=await vscode.commands.getCommands(true);
  const native=commands.includes(NATIVE_OVERLAY_UPDATE_COMMAND)
    ?{id:'native-overlay',label:'Native companion overlay',status:'pass' as const,detail:'The patched Code - OSS workbench contribution is available.'}
    :{id:'native-overlay',label:'Native companion overlay',status:'warning' as const,detail:'The extension is running without the patched native workbench overlay.',nextAction:'Run Pets Council inside the bootstrapped Code - OSS distribution for global companions.'};
  const petErrors=validatePetPack(BUILTIN_PET_PACK);
  const pets=petErrors.length
    ?{id:'pet-pack',label:'Built-in Pet Pack',status:'failure' as const,detail:petErrors.join('\n'),nextAction:'Fix the built-in Pet Pack before shipping this build.'}
    :{id:'pet-pack',label:'Built-in Pet Pack',status:'pass' as const,detail:`${BUILTIN_PET_PACK.pets.length} canonical companions passed manifest and atlas validation.`};
  const storage=vscode.workspace.workspaceFolders?.length
    ?{id:'local-storage',label:'Local project storage',status:'pass' as const,detail:'Session, placement, graph, and usage state can be scoped to the current workspace.'}
    :{id:'local-storage',label:'Local project storage',status:'warning' as const,detail:'Project-scoped memory is unavailable until a folder is opened.'};
  return[workspace,codex,native,pets,storage];
}

export async function openProductDiagnostics(configuredBinary?:string):Promise<void>{
  const report=renderDiagnosticReport(await runProductDiagnostics(configuredBinary));
  const document=await vscode.workspace.openTextDocument({language:'markdown',content:report});
  await vscode.window.showTextDocument(document,{preview:false,viewColumn:vscode.ViewColumn.Beside});
}

async function probeCodex(binary:string):Promise<DiagnosticCheck>{
  try{
    const version=await runVersion(binary);
    return{id:'codex',label:'Codex CLI',status:'pass',detail:`${binary} responded${version?` with ${version}`:''}. Authentication and app-server handshake are checked only after an explicit connection.`};
  }catch(error){
    return{id:'codex',label:'Codex CLI',status:'failure',detail:`Could not execute ${binary}: ${error instanceof Error?error.message:String(error)}`,nextAction:'Install/authenticate Codex or set petsCouncil.codexBinary to the correct executable.'};
  }
}

function runVersion(binary:string):Promise<string>{return new Promise((resolve,reject)=>{
  const child=spawn(binary,['--version'],{stdio:['ignore','pipe','pipe']});let stdout='',stderr='';
  const timeout=setTimeout(()=>{child.kill();reject(new Error('version probe timed out'));},3_000);
  child.stdout?.setEncoding('utf8');child.stderr?.setEncoding('utf8');child.stdout?.on('data',(chunk:string)=>stdout+=chunk);child.stderr?.on('data',(chunk:string)=>stderr+=chunk);
  child.once('error',(error)=>{clearTimeout(timeout);reject(error);});child.once('exit',(code)=>{clearTimeout(timeout);code===0?resolve(stdout.trim().split(/\r?\n/)[0]??''):reject(new Error(stderr.trim()||`exited with code ${code??'unknown'}`));});
});}

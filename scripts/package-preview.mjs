import { access, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { applyProductBranding } from './apply-product-branding.mjs';
import { syncExtension } from './sync-extension.mjs';
import { applyNativeOverlay } from './apply-native-overlay.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const codeOssRoot=path.resolve(root,process.env.CODE_OSS_ROOT||'.vendor/vscode');
const artifacts=path.join(root,'artifacts');
const prepareOnly=process.argv.includes('--prepare-only');
const skipInstall=process.argv.includes('--skip-install');
const target=argument('--target')||defaultTarget();

async function main(){
  assertNodeMajor(24);
  await ensureBootstrap();
  await run('npm',['run','build'],root);
  await syncExtension();
  await applyNativeOverlay(codeOssRoot);
  const branding=await applyProductBranding(codeOssRoot);
  await mkdir(artifacts,{recursive:true});
  if(prepareOnly){await writeManifest(branding.previewVersion,target,undefined);console.log('Preview sources prepared. Packaging task was intentionally skipped.');return;}
  if(!skipInstall)await run('npm',['install'],codeOssRoot);
  await run(process.platform==='win32'?'npx.cmd':'npx',['gulp',`vscode-${target}`],codeOssRoot);
  const productDirectory=await findProductDirectory(target);
  const extensionEntry=path.join(productDirectory,'resources','app','extensions','pets-council','dist','extension.js');
  await access(extensionEntry);
  const archive=await archiveProduct(productDirectory,branding.previewVersion,target);
  await writeManifest(branding.previewVersion,target,archive);
  console.log(`Desktop Preview package created: ${path.relative(root,archive)}`);
}

async function ensureBootstrap(){
  if(await exists(path.join(codeOssRoot,'.git')))return;
  await run('npm',['run','bootstrap'],root);
}

async function findProductDirectory(targetName){
  const parent=path.dirname(codeOssRoot),entries=await readdir(parent,{withFileTypes:true});
  const candidates=entries.filter((entry)=>entry.isDirectory()&&entry.name!=='vscode'&&(entry.name.toLowerCase().includes(targetName.toLowerCase())||entry.name.startsWith('VSCode-'))).map((entry)=>path.join(parent,entry.name));
  for(const candidate of candidates){if(await exists(path.join(candidate,'resources','app','product.json'))||await exists(path.join(candidate,'resources','app','extensions')))return candidate;}
  throw new Error(`Could not locate the packaged vscode-${targetName} output beside ${codeOssRoot}.`);
}

async function archiveProduct(productDirectory,version,targetName){
  const base=`pets-council-preview-${version}-${targetName}`;
  const archive=path.join(artifacts,process.platform==='win32'?`${base}.zip`:`${base}.tar.gz`);
  const args=process.platform==='win32'?['-a','-c','-f',archive,'-C',path.dirname(productDirectory),path.basename(productDirectory)]:['-czf',archive,'-C',path.dirname(productDirectory),path.basename(productDirectory)];
  await run('tar',args,root);return archive;
}

async function writeManifest(version,targetName,archive){
  const product=JSON.parse(await readFile(path.join(codeOssRoot,'product.json'),'utf8'));
  const manifest={schemaVersion:1,version,target:targetName,commit:process.env.GITHUB_SHA||process.env.SOURCE_VERSION||'local',createdAt:new Date().toISOString(),signed:false,notarized:false,archive:archive?path.basename(archive):undefined,product:{nameShort:product.nameShort,nameLong:product.nameLong,applicationName:product.applicationName,darwinBundleIdentifier:product.darwinBundleIdentifier,win32AppUserModelId:product.win32AppUserModelId}};
  await writeFile(path.join(artifacts,`pets-council-preview-${version}-${targetName}.json`),`${JSON.stringify(manifest,null,2)}\n`,'utf8');
}

function defaultTarget(){const arch=process.arch==='arm64'?'arm64':'x64';if(process.platform==='darwin')return`darwin-${arch}`;if(process.platform==='win32')return`win32-${arch}`;return`linux-${arch}`;}
function argument(name){const index=process.argv.indexOf(name);return index>=0?process.argv[index+1]:undefined;}
function assertNodeMajor(expected){const major=Number(process.versions.node.split('.')[0]);if(major!==expected)throw new Error(`Desktop packaging requires Node.js ${expected}.x (found ${process.versions.node}).`);}
function run(command,args,cwd){return new Promise((resolve,reject)=>{const child=spawn(command,args,{cwd,stdio:'inherit',shell:process.platform==='win32'});child.once('error',reject);child.once('exit',(code)=>code===0?resolve():reject(new Error(`${command} exited with code ${code??'unknown'}.`)));});}
async function exists(candidate){try{await stat(candidate);return true;}catch{return false;}}

main().catch((error)=>{console.error(error instanceof Error?error.message:error);process.exitCode=1;});

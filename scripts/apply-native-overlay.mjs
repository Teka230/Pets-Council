import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const importLine="import './contrib/petsCouncil/browser/petsCouncil.contribution.js';";
const anchor="import './browser/workbench.contribution.js';";

export async function applyNativeOverlay(codeOssRoot=process.env.CODE_OSS_ROOT||'.vendor/vscode'){
  const vendor=path.resolve(root,codeOssRoot),source=path.join(root,'native/code-oss/src/vs/workbench/contrib/petsCouncil'),target=path.join(vendor,'src/vs/workbench/contrib/petsCouncil'),mainFile=path.join(vendor,'src/vs/workbench/workbench.common.main.ts');
  await mkdir(path.dirname(target),{recursive:true});await cp(source,target,{recursive:true,force:true});
  const before=await readFile(mainFile,'utf8');if(!before.includes(anchor))throw new Error(`Cannot patch ${mainFile}: expected anchor was not found.`);if(!before.includes(importLine))await writeFile(mainFile,before.replace(anchor,`${anchor}\n${importLine}`),'utf8');
  console.log(`Pets Council native overlay applied to ${vendor}`);
}
const invokedDirectly=process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href;
if(invokedDirectly)applyNativeOverlay().catch((error)=>{console.error(error instanceof Error?error.message:error);process.exitCode=1;});

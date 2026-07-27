import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sourceMode=process.argv.includes('--source');
const base=sourceMode?path.join(root,'native/code-oss'):path.resolve(root,process.env.CODE_OSS_ROOT||'.vendor/vscode');
const files=['src/vs/workbench/contrib/petsCouncil/browser/petsCouncilOverlay.ts','src/vs/workbench/contrib/petsCouncil/browser/petsCouncil.contribution.ts','src/vs/workbench/contrib/petsCouncil/browser/media/petsCouncilOverlay.css'];
for(const relative of files)await access(path.join(base,relative));
const contribution=await readFile(path.join(base,files[1]),'utf8');
for(const command of ['petsCouncil.nativeOverlay.update','petsCouncil.nativeOverlay.hide'])if(!contribution.includes(command))throw new Error(`Native overlay contribution is missing ${command}.`);
if(!sourceMode){const main=await readFile(path.join(base,'src/vs/workbench/workbench.common.main.ts'),'utf8');if(!main.includes("import './contrib/petsCouncil/browser/petsCouncil.contribution.js';"))throw new Error('Code - OSS workbench entrypoint does not import the Pets Council contribution.');}
console.log(sourceMode?'Pets Council native overlay sources are complete.':'Pets Council native overlay is applied and linked.');

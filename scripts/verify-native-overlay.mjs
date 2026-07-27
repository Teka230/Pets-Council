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
const overlay=await readFile(path.join(base,files[0]),'utf8');
for(const contract of ['IPetsCouncilNativeAtlas','hatch-v2','anchor','applyAtlasFrame'])if(!overlay.includes(contract))throw new Error(`Native overlay is missing ${contract} support.`);
const css=await readFile(path.join(base,files[2]),'utf8');
for(const anchor of ['anchor-editor','anchor-terminal','anchor-sidebar','anchor-memory'])if(!css.includes(anchor))throw new Error(`Native overlay CSS is missing ${anchor}.`);
if(!sourceMode){const main=await readFile(path.join(base,'src/vs/workbench/workbench.common.main.ts'),'utf8');if(!main.includes("import './contrib/petsCouncil/browser/petsCouncil.contribution.js';"))throw new Error('Code - OSS workbench entrypoint does not import the Pets Council contribution.');}
console.log(sourceMode?'Pets Council native overlay sources include atlas and anchor support.':'Pets Council native overlay is applied, linked, and atlas-capable.');

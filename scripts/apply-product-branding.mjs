import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');

export async function applyProductBranding(codeOssRoot=process.env.CODE_OSS_ROOT||'.vendor/vscode'){
  const config=JSON.parse(await readFile(path.join(root,'config','product-preview.json'),'utf8'));
  const productPath=path.resolve(root,codeOssRoot,'product.json');
  const product=JSON.parse(await readFile(productPath,'utf8'));
  const {previewVersion,...branding}=config;
  const next={...product,...branding,petsCouncilPreviewVersion:previewVersion};
  await writeFile(productPath,`${JSON.stringify(next,null,2)}\n`,'utf8');
  console.log(`Pets Council Preview ${previewVersion} branding applied to ${path.relative(root,productPath)}.`);
  return{productPath,previewVersion};
}

const invokedDirectly=process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href;
if(invokedDirectly)applyProductBranding().catch((error)=>{console.error(error instanceof Error?error.message:error);process.exitCode=1;});

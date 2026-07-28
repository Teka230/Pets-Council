import { createHash } from 'node:crypto';
import { access, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = argument('--target') ?? process.env.PREVIEW_TARGET;
const version = argument('--version') ?? '0.1.0-preview.1';
if (!target) throw new Error('Pass --target, for example linux-x64, darwin-arm64, or win32-x64.');

const source = path.join(root, '.vendor', `VSCode-${target}`);
const artifacts = path.join(root, 'artifacts', 'desktop-preview');
const archiveBase = `Pets-Council-Desktop-Preview-${version}-${target}`;
const archive = path.join(artifacts, `${archiveBase}.tar.gz`);

await access(source);
const extensionEntrypoint = await findFile(source, path.join('extensions', 'pets-council', 'dist', 'extension.js'));
if (!extensionEntrypoint) throw new Error('Packaged output does not contain the integrated Pets Council extension entrypoint.');
const productJsonPath = await findNamedFile(source, 'product.json');
if (!productJsonPath) throw new Error('Packaged output does not contain product.json.');
const product = JSON.parse(await readFile(productJsonPath, 'utf8'));

await mkdir(artifacts, { recursive: true });
await run('tar', ['-czf', archive, '-C', path.dirname(source), path.basename(source)]);
const checksum = await sha256(archive);
const archiveStat = await stat(archive);
const manifest = {
  schemaVersion: 1,
  product: 'Pets Council Desktop Preview',
  version,
  target,
  commit: process.env.GITHUB_SHA ?? process.env.PREVIEW_COMMIT ?? 'local',
  upstream: await readJson(path.join(root, 'config', 'upstream.json')),
  packagedProduct: {
    nameShort: product.nameShort,
    nameLong: product.nameLong,
    applicationName: product.applicationName
  },
  archive: path.basename(archive),
  bytes: archiveStat.size,
  sha256: checksum,
  signed: false,
  notarized: false,
  generatedAt: new Date().toISOString()
};
await writeFile(path.join(artifacts, `${archiveBase}.manifest.json`), `${JSON.stringify(manifest, null, 2)}\n`);
await writeFile(path.join(artifacts, `${archiveBase}.sha256`), `${checksum}  ${path.basename(archive)}\n`);
console.log(JSON.stringify(manifest, null, 2));

function argument(name) { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; }
async function readJson(file) { return JSON.parse(await readFile(file, 'utf8')); }
async function sha256(file) { const hash=createHash('sha256');hash.update(await readFile(file));return hash.digest('hex'); }
async function findFile(base, suffix) { const normalized=suffix.split(path.sep).join('/');for(const file of await walk(base,7)){if(file.split(path.sep).join('/').endsWith(normalized))return file;}return undefined; }
async function findNamedFile(base, name) { for(const file of await walk(base,7)){if(path.basename(file)===name&&file.includes(`${path.sep}resources${path.sep}app${path.sep}`))return file;}return undefined; }
async function walk(directory, depth) { if(depth<0)return[];const result=[];for(const entry of await readdir(directory,{withFileTypes:true})){const candidate=path.join(directory,entry.name);if(entry.isDirectory())result.push(...await walk(candidate,depth-1));else result.push(candidate);}return result; }
function run(command,args){return new Promise((resolve,reject)=>{const child=spawn(command,args,{cwd:root,stdio:'inherit',shell:process.platform==='win32'});child.once('error',reject);child.once('exit',(code)=>code===0?resolve():reject(new Error(`${command} exited with code ${code??'unknown'}.`)));});}

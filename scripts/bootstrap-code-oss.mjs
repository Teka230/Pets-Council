import { mkdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { syncExtension } from './sync-extension.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const upstreamConfigPath = path.join(repositoryRoot, 'config', 'upstream.json');
const vendorDirectory = path.join(repositoryRoot, '.vendor');
const vscodeDirectory = path.join(vendorDirectory, 'vscode');

async function main() {
  const upstream = JSON.parse(await readFile(upstreamConfigPath, 'utf8'));

  await mkdir(vendorDirectory, { recursive: true });

  if (await exists(path.join(vscodeDirectory, '.git'))) {
    console.log('Code - OSS checkout already exists; keeping the current working tree.');
  } else {
    if (await exists(vscodeDirectory)) {
      throw new Error('The .vendor/vscode directory exists but is not a Git checkout. Remove it and retry.');
    }

    console.log(`Cloning Code - OSS ${upstream.version}...`);
    await run('git', [
      'clone',
      '--filter=blob:none',
      '--no-checkout',
      upstream.repository,
      vscodeDirectory
    ]);

    await run('git', [
      '-C',
      vscodeDirectory,
      'checkout',
      '--detach',
      upstream.ref
    ]);
  }

  await syncExtension();

  console.log('\nBootstrap complete.');
  console.log('Next steps:');
  console.log('  1. cd .vendor/vscode');
  console.log('  2. npm install');
  console.log('  3. npm run compile');
  console.log('  4. ./scripts/code');
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repositoryRoot,
      stdio: 'inherit'
    });

    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} exited with code ${code ?? 'unknown'}.`));
    });
  });
}

async function exists(candidate) {
  try {
    await stat(candidate);
    return true;
  } catch {
    return false;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

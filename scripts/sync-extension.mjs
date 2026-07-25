import { cp, mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceDirectory = path.join(repositoryRoot, 'extensions', 'pets-council');
const vscodeDirectory = path.join(repositoryRoot, '.vendor', 'vscode');
const targetDirectory = path.join(vscodeDirectory, 'extensions', 'pets-council');

export async function syncExtension() {
  if (!(await exists(vscodeDirectory))) {
    throw new Error('Code - OSS is not bootstrapped yet. Run `npm run bootstrap` first.');
  }

  await rm(targetDirectory, { recursive: true, force: true });
  await mkdir(path.dirname(targetDirectory), { recursive: true });
  await cp(sourceDirectory, targetDirectory, {
    recursive: true,
    filter: (source) => {
      const relativePath = path.relative(sourceDirectory, source);
      const segments = relativePath.split(path.sep);
      return !segments.includes('node_modules') && !segments.includes('dist');
    }
  });

  console.log(`Synced Pets Council extension to ${path.relative(repositoryRoot, targetDirectory)}`);
}

async function exists(candidate) {
  try {
    await stat(candidate);
    return true;
  } catch {
    return false;
  }
}

const invokedDirectly = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (invokedDirectly) {
  syncExtension().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

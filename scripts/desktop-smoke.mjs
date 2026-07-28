import { access, readFile, rename, stat } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const codeOssRoot = path.resolve(root, process.env.CODE_OSS_ROOT || '.vendor/vscode');
const compileOnly = process.argv.includes('--compile-only');
const skipInstall = process.argv.includes('--skip-install');
const skipCompile = process.argv.includes('--skip-compile');
const parentVscodeTypes = path.join(root, 'node_modules', '@types', 'vscode');
const parentVscodeTypesAside = `${parentVscodeTypes}.__aside__`;

async function main() {
  await ensureBootstrap();
  if (!skipCompile) {
    assertNodeMajor(24);
    if (!skipInstall) {
      await run('npm', ['install'], codeOssRoot);
    }
    await withHiddenParentVscodeTypes(async () => {
      await run('npm', ['run', 'compile'], codeOssRoot);
    });
  }
  await verifyDesktopSources();
  console.log('\nDesktop smoke compile completed.');
  console.log(`Code - OSS root: ${codeOssRoot}`);
  console.log('Verified: integrated extension entrypoint, native overlay contribution, compiled workbench output.');
  if (compileOnly) {
    return;
  }

  const launcher = process.platform === 'win32'
    ? path.join(codeOssRoot, 'scripts', 'code.bat')
    : path.join(codeOssRoot, 'scripts', 'code.sh');
  await access(launcher);
  console.log('Launching the patched workbench for the manual smoke scenario…');
  await run(launcher, ['--disable-workspace-trust', '--skip-welcome'], codeOssRoot, {
    ELECTRON_RUN_AS_NODE: '',
    NODE_ENV: 'development',
    VSCODE_DEV: '1',
    VSCODE_CLI: '1'
  });
}

async function ensureBootstrap() {
  if (!(await exists(path.join(codeOssRoot, '.git')))) {
    await run('npm', ['run', 'bootstrap'], root);
    return;
  }

  await run('npm', ['run', 'build'], root);
  await run('npm', ['run', 'sync:extension'], root);
  await run('npm', ['run', 'native:apply'], root);
}

async function verifyDesktopSources() {
  await run('npm', ['run', 'native:verify'], root);
  await access(path.join(codeOssRoot, 'extensions', 'pets-council', 'dist', 'extension.js'));
  const packageJson = JSON.parse(
    await readFile(path.join(codeOssRoot, 'extensions', 'pets-council', 'package.json'), 'utf8')
  );
  if (packageJson.main !== './dist/extension.js') {
    throw new Error('Integrated extension entrypoint does not match the compiled artifact.');
  }

  const compiledCandidates = [
    path.join(codeOssRoot, 'out', 'main.js'),
    path.join(codeOssRoot, 'out', 'vs', 'code', 'electron-browser', 'workbench', 'workbench.js'),
    path.join(codeOssRoot, 'out', 'vs', 'workbench', 'workbench.desktop.main.js'),
    path.join(codeOssRoot, 'out', 'vs', 'workbench', 'workbench.web.main.js'),
    path.join(codeOssRoot, 'out', 'vs', 'workbench', 'workbench.common.main.js')
  ];
  if (!(await anyExists(compiledCandidates))) {
    throw new Error('Code - OSS compile completed without a recognizable workbench output.');
  }
}

function assertNodeMajor(expectedMajor) {
  const major = Number(process.versions.node.split('.')[0]);
  if (major !== expectedMajor) {
    throw new Error(
      `Code - OSS desktop smoke requires Node.js ${expectedMajor}.x (found ${process.versions.node}). Run: nvm use ${expectedMajor}`
    );
  }
}

async function withHiddenParentVscodeTypes(action) {
  const present = await exists(parentVscodeTypes);
  if (present) {
    await rename(parentVscodeTypes, parentVscodeTypesAside);
  }

  try {
    await action();
  } finally {
    if (present && await exists(parentVscodeTypesAside)) {
      await rename(parentVscodeTypesAside, parentVscodeTypes);
    }
  }
}

function run(command, args, cwd, envOverrides = {}) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env, ...envOverrides };
    if (Object.prototype.hasOwnProperty.call(envOverrides, 'ELECTRON_RUN_AS_NODE') && !envOverrides.ELECTRON_RUN_AS_NODE) {
      delete env.ELECTRON_RUN_AS_NODE;
    }

    const child = spawn(command, args, {
      cwd,
      env,
      stdio: 'inherit',
      shell: process.platform === 'win32'
    });
    child.once('error', reject);
    child.once('exit', (code) => (
      code === 0
        ? resolve()
        : reject(new Error(`${command} exited with code ${code ?? 'unknown'}.`))
    ));
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

async function anyExists(candidates) {
  for (const candidate of candidates) {
    if (await exists(candidate)) {
      return true;
    }
  }
  return false;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

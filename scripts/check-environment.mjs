import { spawnSync } from 'node:child_process';

const minimumNodeMajor = 22;
const currentNodeMajor = Number.parseInt(process.versions.node.split('.')[0] ?? '0', 10);
const failures = [];

if (currentNodeMajor < minimumNodeMajor) {
  failures.push(`Node.js ${minimumNodeMajor}+ is required; found ${process.versions.node}.`);
} else {
  console.log(`✓ Node.js ${process.versions.node}`);
}

const gitCheck = spawnSync('git', ['--version'], {
  encoding: 'utf8'
});

if (gitCheck.status !== 0) {
  failures.push('Git is required but was not found on PATH.');
} else {
  console.log(`✓ ${gitCheck.stdout.trim()}`);
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`✗ ${failure}`);
  }
  process.exitCode = 1;
} else {
  console.log('Environment is ready for Pets Council.');
}

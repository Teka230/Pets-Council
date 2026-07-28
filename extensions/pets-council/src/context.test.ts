import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDiffSummary, parseGitStatus, truncateText, workspaceGitPathPrefix } from './context';

test('truncates selected text at the configured boundary', () => {
  assert.deepEqual(truncateText('abcdef', 4), {
    value: 'abc…',
    truncated: true
  });
});

test('returns no selected text for whitespace-only input', () => {
  assert.deepEqual(truncateText('   \n  ', 20), {
    truncated: false
  });
});

test('parses modified and untracked paths from porcelain output', () => {
  const result = parseGitStatus([
    ' M extensions/pets-council/src/extension.ts',
    '?? docs/context.md',
    ''
  ].join('\0'));

  assert.deepEqual(result, {
    changedFiles: [
      'extensions/pets-council/src/extension.ts',
      'docs/context.md'
    ],
    truncated: false
  });
});

test('keeps the destination path for renamed files', () => {
  const result = parseGitStatus([
    'R  src/new-name.ts',
    'src/old-name.ts',
    ''
  ].join('\0'));

  assert.deepEqual(result.changedFiles, ['src/new-name.ts']);
});

test('limits the changed-file list', () => {
  const result = parseGitStatus([
    ' M first.ts',
    ' M second.ts',
    ' M third.ts',
    ''
  ].join('\0'), 2);

  assert.deepEqual(result.changedFiles, ['first.ts', 'second.ts']);
  assert.equal(result.truncated, true);
});

test('scopes nested-workspace git paths to the open folder', () => {
  assert.equal(workspaceGitPathPrefix('/Users/teka/TKProjets', '/Users/teka/TKProjets/Games/Pets-run'), 'Games/Pets-run/');
  const result = parseGitStatus([
    ' M Games/Pets-run/src/main.ts',
    ' M CodingExtensions/other/file.ts',
    '?? Games/Pets-run/brief.md',
    ''
  ].join('\0'), 50, 'Games/Pets-run/');
  assert.deepEqual(result.changedFiles, ['src/main.ts', 'brief.md']);
});

test('labels staged and unstaged diff summaries', () => {
  const result = buildDiffSummary(
    ' extension.ts | 12 +++++++------',
    ' domain.ts | 4 ++++',
    200
  );

  assert.equal(result.truncated, false);
  assert.equal(
    result.value,
    'Working tree:\nextension.ts | 12 +++++++------\n\nStaged:\ndomain.ts | 4 ++++'
  );
});

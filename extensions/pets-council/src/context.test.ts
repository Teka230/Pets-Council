import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDiffSummary, parseGitStatus, truncateText } from './context';

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

test('labels staged and unstaged diff summaries', () => {
  const result = buildDiffSummary(
    ' extension.ts | 12 ++++++------',
    ' domain.ts | 4 ++++',
    200
  );

  assert.equal(result.truncated, false);
  assert.equal(
    result.value,
    'Working tree:\n extension.ts | 12 ++++++------\n\nStaged:\n domain.ts | 4 ++++'
  );
});

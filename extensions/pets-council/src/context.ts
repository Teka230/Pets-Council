import path from 'node:path';

export const MAX_SELECTION_CHARS = 2_000;
export const MAX_DIFF_SUMMARY_CHARS = 2_000;
export const MAX_CHANGED_FILES = 50;

export type TruncatedText = Readonly<{
  value?: string;
  truncated: boolean;
}>;

export type ParsedGitStatus = Readonly<{
  changedFiles: readonly string[];
  truncated: boolean;
}>;

export function truncateText(value: string, maxChars: number): TruncatedText {
  if (!Number.isInteger(maxChars) || maxChars < 1) {
    throw new Error('maxChars must be a positive integer.');
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return { truncated: false };
  }

  if (trimmed.length <= maxChars) {
    return { value: trimmed, truncated: false };
  }

  return {
    value: `${trimmed.slice(0, Math.max(1, maxChars - 1))}…`,
    truncated: true
  };
}

export function parseGitStatus(
  output: string,
  maxFiles = MAX_CHANGED_FILES,
  pathPrefix?: string
): ParsedGitStatus {
  if (!Number.isInteger(maxFiles) || maxFiles < 1) {
    throw new Error('maxFiles must be a positive integer.');
  }

  const tokens = output.split('\0');
  const files = new Set<string>();
  const normalizedPrefix = normalizePathPrefix(pathPrefix);

  for (let index = 0; index < tokens.length; index += 1) {
    const entry = tokens[index];
    if (!entry || entry.length < 4) {
      continue;
    }

    const status = entry.slice(0, 2);
    const candidate = scopeRepositoryPath(normalizeRepositoryPath(entry.slice(3)), normalizedPrefix);
    if (candidate) {
      files.add(candidate);
    }

    if (status.includes('R') || status.includes('C')) {
      index += 1;
    }
  }

  const changedFiles = [...files];
  return {
    changedFiles: changedFiles.slice(0, maxFiles),
    truncated: changedFiles.length > maxFiles
  };
}

export function workspaceGitPathPrefix(toplevel: string, workspaceFolder: string): string | undefined {
  const relative = normalizeRepositoryPath(path.relative(toplevel, workspaceFolder));
  if (!relative || relative === '.' || relative.startsWith('../')) {
    return undefined;
  }
  return `${relative}/`;
}

export function buildDiffSummary(
  unstagedOutput: string,
  stagedOutput: string,
  maxChars = MAX_DIFF_SUMMARY_CHARS
): TruncatedText {
  const sections: string[] = [];
  const unstaged = unstagedOutput.trim();
  const staged = stagedOutput.trim();

  if (unstaged) {
    sections.push(`Working tree:\n${unstaged}`);
  }

  if (staged) {
    sections.push(`Staged:\n${staged}`);
  }

  return truncateText(sections.join('\n\n'), maxChars);
}

function scopeRepositoryPath(value: string, pathPrefix: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  if (!pathPrefix) {
    return value;
  }
  if (!value.startsWith(pathPrefix)) {
    return undefined;
  }
  return value.slice(pathPrefix.length) || undefined;
}

function normalizePathPrefix(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const normalized = normalizeRepositoryPath(value);
  return normalized.endsWith('/') ? normalized : `${normalized}/`;
}

function normalizeRepositoryPath(value: string): string {
  return value.trim().replaceAll('\\', '/');
}

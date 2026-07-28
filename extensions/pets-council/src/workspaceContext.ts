import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import * as vscode from 'vscode';
import {
  buildDiffSummary,
  MAX_SELECTION_CHARS,
  MAX_CHANGED_FILES,
  parseGitStatus,
  truncateText,
  workspaceGitPathPrefix
} from './context';
import type { CouncilTurn } from './domain';

const GIT_TIMEOUT_MS = 5_000;
const GIT_MAX_BUFFER_BYTES = 512 * 1024;

export async function captureLiveCouncilTurn(): Promise<CouncilTurn> {
  const warnings: string[] = [];
  const workspace = captureWorkspaceContext(warnings);
  const workingDirectory = resolveWorkingDirectory();
  const git = await captureGitContext(workingDirectory, warnings);

  return {
    turnId: `live-${randomUUID()}`,
    userMessage: 'Review the current workspace context and suggest the next useful step.',
    assistantResponse: [
      'The active editor and Git state were captured locally.',
      'Use this bounded context to propose explicit next actions without executing them.'
    ].join(' '),
    capture: {
      mode: 'live',
      capturedAt: new Date().toISOString(),
      warnings
    },
    workspace,
    git
  };
}

function captureWorkspaceContext(
  warnings: string[]
): CouncilTurn['workspace'] {
  const editor = vscode.window.activeTextEditor;
  const workspace: {
    name?: string;
    activeFile?: string;
    selectedText?: string;
    selectedTextTruncated?: boolean;
  } = {};

  if (vscode.workspace.name) {
    workspace.name = vscode.workspace.name;
  }

  if (!editor) {
    warnings.push('No active editor was available when the context was captured.');
    return workspace;
  }

  workspace.activeFile = toWorkspaceDisplayPath(editor.document.uri);

  if (!editor.selection.isEmpty) {
    const selectedText = truncateText(
      editor.document.getText(editor.selection),
      MAX_SELECTION_CHARS
    );

    if (selectedText.value) {
      workspace.selectedText = selectedText.value;
    }

    if (selectedText.truncated) {
      workspace.selectedTextTruncated = true;
      warnings.push(`The editor selection was truncated to ${MAX_SELECTION_CHARS} characters.`);
    }
  }

  return workspace;
}

async function captureGitContext(
  workingDirectory: string | undefined,
  warnings: string[]
): Promise<CouncilTurn['git']> {
  if (!workingDirectory) {
    warnings.push('Open a folder or workspace to include Git context.');
    return undefined;
  }

  let toplevel: string;
  try {
    toplevel = (await runGit(['rev-parse', '--show-toplevel'], workingDirectory)).trim();
  } catch {
    warnings.push('Git context is unavailable for the current workspace.');
    return undefined;
  }

  const pathPrefix = workspaceGitPathPrefix(toplevel, workingDirectory);
  const pathspec = pathPrefix ? ['.'] : [];
  if (pathPrefix) {
    warnings.push('Git context was scoped to the open workspace folder inside a larger repository.');
  }

  const [branchOutput, shortCommit, statusOutput, unstagedDiff, stagedDiff] = await Promise.all([
    safeRunGit(['branch', '--show-current'], workingDirectory),
    safeRunGit(['rev-parse', '--short', 'HEAD'], workingDirectory),
    safeRunGit(['status', '--porcelain=v1', '-z', '--untracked-files=all', '--', ...pathspec], workingDirectory),
    safeRunGit(['diff', '--stat=80,20', '--compact-summary', '--', ...pathspec], workingDirectory),
    safeRunGit(['diff', '--cached', '--stat=80,20', '--compact-summary', '--', ...pathspec], workingDirectory)
  ]);

  const parsedStatus = parseGitStatus(statusOutput, MAX_CHANGED_FILES, pathPrefix);
  const diffSummary = buildDiffSummary(unstagedDiff, stagedDiff);

  if (parsedStatus.truncated) {
    warnings.push('The changed-file list was truncated to 50 entries.');
  }

  if (diffSummary.truncated) {
    warnings.push('The Git diff summary was truncated to 2,000 characters.');
  }

  const branch = branchOutput.trim()
    || (shortCommit.trim() ? `detached@${shortCommit.trim()}` : undefined);

  return {
    branch,
    changedFiles: parsedStatus.changedFiles,
    changedFilesTruncated: parsedStatus.truncated || undefined,
    diffSummary: diffSummary.value,
    diffSummaryTruncated: diffSummary.truncated || undefined
  };
}

function resolveWorkingDirectory(): string | undefined {
  const activeDocument = vscode.window.activeTextEditor?.document;
  if (activeDocument) {
    const activeFolder = vscode.workspace.getWorkspaceFolder(activeDocument.uri);
    if (activeFolder) {
      return activeFolder.uri.fsPath;
    }
  }

  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

function toWorkspaceDisplayPath(uri: vscode.Uri): string {
  const folder = vscode.workspace.getWorkspaceFolder(uri);
  if (folder && uri.scheme === 'file') {
    return path.relative(folder.uri.fsPath, uri.fsPath).split(path.sep).join('/');
  }

  if (uri.scheme === 'file') {
    return path.basename(uri.fsPath);
  }

  const finalSegment = uri.path.split('/').filter(Boolean).at(-1);
  return finalSegment ?? uri.toString(true);
}

function safeRunGit(args: readonly string[], cwd: string): Promise<string> {
  return runGit(args, cwd).catch(() => '');
}

function runGit(args: readonly string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      ['-C', cwd, ...args],
      {
        encoding: 'utf8',
        maxBuffer: GIT_MAX_BUFFER_BYTES,
        timeout: GIT_TIMEOUT_MS,
        windowsHide: true
      },
      (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(stdout);
      }
    );
  });
}

import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';
import type { CouncilReview, CouncilTurn } from './domain';
import { reviewMockTurn } from './mockCouncil';
import { buildCouncilTurnFromCompletedCodexTurn } from './runtime/councilBridge';
import { CodexRuntimeService, resolveCodexBinary } from './runtime/service';
import { CodexSessionStore, createWorkspaceSessionKey } from './runtime/sessionStore';
import { createStdioCodexTransport } from './runtime/stdioTransport';
import type { CodexApprovalDecision } from './runtime/types';
import { renderCouncilHtml } from './webview';
import { captureLiveCouncilTurn } from './workspaceContext';

type CopyPromptMessage = Readonly<{ type: 'copyPrompt'; value: string }>;
type StartCodexTurnMessage = Readonly<{ type: 'startCodexTurn'; value: string }>;
type ApprovalMessage = Readonly<{
  type: 'respondCodexApproval';
  decision: CodexApprovalDecision;
}>;
type SimpleMessage = Readonly<{
  type:
    | 'refreshContext'
    | 'openFolder'
    | 'connectCodex'
    | 'disconnectCodex'
    | 'startCodexThread'
    | 'resumeCodexThread'
    | 'interruptCodexTurn';
}>;

type CouncilWebviewMessage =
  | CopyPromptMessage
  | StartCodexTurnMessage
  | ApprovalMessage
  | SimpleMessage;

export function activate(context: vscode.ExtensionContext): void {
  const runtime = new CodexRuntimeService(
    resolveCodexBinary(readConfiguredCodexBinary()),
    createStdioCodexTransport
  );
  const sessionStore = new CodexSessionStore(context.workspaceState);
  let sessionKey = currentWorkspaceSessionKey();
  let persistedThreadId = sessionStore.load(sessionKey)?.threadId;
  runtime.setResumeCandidate(sessionStore.load(sessionKey));

  const persistenceSubscription = runtime.onDidChange((status) => {
    const threadId = status.thread.thread?.id;
    if (status.thread.phase !== 'ready' || !threadId || threadId === persistedThreadId) {
      return;
    }

    persistedThreadId = threadId;
    void sessionStore.save(sessionKey, threadId).then((candidate) => {
      runtime.setResumeCandidate(candidate);
    });
  });

  const workspaceSubscription = vscode.workspace.onDidChangeWorkspaceFolders(() => {
    if (runtime.status.thread.phase === 'ready') {
      return;
    }
    sessionKey = currentWorkspaceSessionKey();
    const candidate = sessionStore.load(sessionKey);
    persistedThreadId = candidate?.threadId;
    runtime.setResumeCandidate(candidate);
  });

  const openCouncil = vscode.commands.registerCommand(
    'petsCouncil.openCouncil',
    () => showCouncilPanel(runtime)
  );
  const configurationSubscription = vscode.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration('petsCouncil.codexBinary')) {
      runtime.setBinary(resolveCodexBinary(readConfiguredCodexBinary()));
    }
  });

  context.subscriptions.push(
    openCouncil,
    configurationSubscription,
    workspaceSubscription,
    persistenceSubscription,
    { dispose: () => runtime.dispose() }
  );
}

export function deactivate(): void {
  // ExtensionContext disposes the shared runtime service.
}

function showCouncilPanel(runtime: CodexRuntimeService): void {
  const panel = vscode.window.createWebviewPanel(
    'petsCouncil.panel',
    'Pets Council',
    vscode.ViewColumn.Beside,
    { enableScripts: true, retainContextWhenHidden: true }
  );

  let disposed = false;
  let renderSequence = 0;
  let currentTurn: CouncilTurn | undefined;
  let currentReview: CouncilReview | undefined;
  let lastBridgedTurnId: string | undefined;

  const bridgeCompletedTurn = (): void => {
    if (!currentTurn) {
      return;
    }
    const bridged = buildCouncilTurnFromCompletedCodexTurn(currentTurn, runtime.status);
    if (!bridged || bridged.turnId === lastBridgedTurnId) {
      return;
    }
    currentTurn = bridged;
    currentReview = reviewMockTurn(bridged);
    lastBridgedTurnId = bridged.turnId;
  };

  const renderCurrent = (): void => {
    if (disposed || !currentTurn || !currentReview) {
      return;
    }
    panel.webview.html = renderCouncilHtml(
      currentTurn,
      currentReview,
      runtime.status,
      createNonce()
    );
  };

  const refreshContext = async (): Promise<void> => {
    const sequence = ++renderSequence;
    panel.webview.html = renderLoadingHtml(createNonce());
    const contextTurn = await captureLiveCouncilTurn();
    if (disposed || sequence !== renderSequence) {
      return;
    }
    currentTurn = contextTurn;
    currentReview = reviewMockTurn(contextTurn);
    bridgeCompletedTurn();
    renderCurrent();
  };

  const runtimeSubscription = runtime.onDidChange(() => {
    bridgeCompletedTurn();
    renderCurrent();
  });

  const messageSubscription = panel.webview.onDidReceiveMessage(
    async (message: unknown) => {
      if (!isCouncilWebviewMessage(message)) {
        return;
      }

      switch (message.type) {
        case 'refreshContext':
          await refreshContext();
          return;
        case 'openFolder':
          await openFolderFromCouncil();
          return;
        case 'connectCodex':
          await runtime.connect();
          return;
        case 'disconnectCodex':
          runtime.disconnect();
          return;
        case 'startCodexThread':
          await runtime.startThread(currentWorkspaceDirectory());
          return;
        case 'resumeCodexThread':
          await runtime.resumeThread(undefined, currentWorkspaceDirectory());
          return;
        case 'startCodexTurn':
          await runtime.startTurn(message.value, currentWorkspaceDirectory());
          return;
        case 'interruptCodexTurn':
          await runtime.interruptTurn();
          return;
        case 'respondCodexApproval':
          runtime.respondApproval(message.decision);
          return;
        case 'copyPrompt': {
          const prompt = message.value.trim();
          if (!prompt) {
            return;
          }
          await vscode.env.clipboard.writeText(prompt);
          void vscode.window.showInformationMessage(
            'Council prompt copied. Nothing was executed.'
          );
        }
      }
    }
  );

  panel.onDidDispose(() => {
    disposed = true;
    runtimeSubscription.dispose();
    messageSubscription.dispose();
  });

  void refreshContext();
}

async function openFolderFromCouncil(): Promise<void> {
  const selected = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    openLabel: 'Open folder',
    title: 'Open a project for Pets Council'
  });
  const folder = selected?.[0];
  if (folder) {
    await vscode.commands.executeCommand('vscode.openFolder', folder);
  }
}

function currentWorkspaceDirectory(): string | undefined {
  const activeUri = vscode.window.activeTextEditor?.document.uri;
  const activeFolder = activeUri
    ? vscode.workspace.getWorkspaceFolder(activeUri)
    : undefined;
  return activeFolder?.uri.fsPath ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

function currentWorkspaceSessionKey(): string {
  return createWorkspaceSessionKey(
    (vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri.toString())
  );
}

function readConfiguredCodexBinary(): string | undefined {
  return vscode.workspace
    .getConfiguration('petsCouncil')
    .get<string>('codexBinary');
}

function isCouncilWebviewMessage(message: unknown): message is CouncilWebviewMessage {
  if (typeof message !== 'object' || message === null) {
    return false;
  }

  const candidate = message as {
    type?: unknown;
    value?: unknown;
    decision?: unknown;
  };

  if (
    candidate.type === 'refreshContext'
    || candidate.type === 'openFolder'
    || candidate.type === 'connectCodex'
    || candidate.type === 'disconnectCodex'
    || candidate.type === 'startCodexThread'
    || candidate.type === 'resumeCodexThread'
    || candidate.type === 'interruptCodexTurn'
  ) {
    return true;
  }

  if (
    (candidate.type === 'copyPrompt' || candidate.type === 'startCodexTurn')
    && typeof candidate.value === 'string'
  ) {
    return true;
  }

  return candidate.type === 'respondCodexApproval'
    && (candidate.decision === 'accept' || candidate.decision === 'decline');
}

function createNonce(): string {
  return randomBytes(18).toString('base64');
}

function renderLoadingHtml(nonce: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'"><title>Pets Council</title><style>:root{color-scheme:light dark;font-family:var(--vscode-font-family)}body{padding:32px;color:var(--vscode-foreground);background:var(--vscode-editor-background)}</style></head><body><h1>Capturing workspace context…</h1><p>Reading bounded editor and Git state locally.</p></body></html>`;
}

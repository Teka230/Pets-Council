import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';
import type { CouncilReview, CouncilTurn } from './domain';
import { reviewMockTurn } from './mockCouncil';
import { CodexRuntimeService, resolveCodexBinary } from './runtime/service';
import { createStdioCodexTransport } from './runtime/stdioTransport';
import { renderCouncilHtml } from './webview';
import { captureLiveCouncilTurn } from './workspaceContext';

type CopyPromptMessage = Readonly<{
  type: 'copyPrompt';
  value: string;
}>;

type RefreshContextMessage = Readonly<{
  type: 'refreshContext';
}>;

type OpenFolderMessage = Readonly<{
  type: 'openFolder';
}>;

type ConnectCodexMessage = Readonly<{
  type: 'connectCodex';
}>;

type DisconnectCodexMessage = Readonly<{
  type: 'disconnectCodex';
}>;

type StartCodexThreadMessage = Readonly<{
  type: 'startCodexThread';
}>;

type CouncilWebviewMessage =
  | CopyPromptMessage
  | RefreshContextMessage
  | OpenFolderMessage
  | ConnectCodexMessage
  | DisconnectCodexMessage
  | StartCodexThreadMessage;

export function activate(context: vscode.ExtensionContext): void {
  const runtime = new CodexRuntimeService(
    resolveCodexBinary(readConfiguredCodexBinary()),
    createStdioCodexTransport
  );
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
    {
      enableScripts: true,
      retainContextWhenHidden: true
    }
  );

  let disposed = false;
  let renderSequence = 0;
  let currentTurn: CouncilTurn | undefined;
  let currentReview: CouncilReview | undefined;

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

  const renderLiveContext = async (): Promise<void> => {
    const currentSequence = ++renderSequence;
    panel.webview.html = renderLoadingHtml(createNonce());

    const turn = await captureLiveCouncilTurn();
    if (disposed || currentSequence !== renderSequence) {
      return;
    }

    currentTurn = turn;
    currentReview = reviewMockTurn(turn);
    renderCurrent();
  };

  const runtimeSubscription = runtime.onDidChange(() => renderCurrent());
  const messageSubscription = panel.webview.onDidReceiveMessage(
    async (message: unknown) => {
      if (!isCouncilWebviewMessage(message)) {
        return;
      }

      if (message.type === 'refreshContext') {
        await renderLiveContext();
        return;
      }

      if (message.type === 'openFolder') {
        await openFolderFromCouncil();
        return;
      }

      if (message.type === 'connectCodex') {
        await runtime.connect();
        return;
      }

      if (message.type === 'disconnectCodex') {
        runtime.disconnect();
        return;
      }

      if (message.type === 'startCodexThread') {
        await runtime.startThread(currentWorkspaceDirectory());
        return;
      }

      const prompt = message.value.trim();
      if (!prompt) {
        return;
      }

      await vscode.env.clipboard.writeText(prompt);
      void vscode.window.showInformationMessage('Council prompt copied. Nothing was executed.');
    }
  );

  panel.onDidDispose(() => {
    disposed = true;
    runtimeSubscription.dispose();
    messageSubscription.dispose();
  });

  void renderLiveContext();
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
  if (!folder) {
    return;
  }

  await vscode.commands.executeCommand('vscode.openFolder', folder);
}

function currentWorkspaceDirectory(): string | undefined {
  const activeUri = vscode.window.activeTextEditor?.document.uri;
  if (activeUri) {
    const folder = vscode.workspace.getWorkspaceFolder(activeUri);
    if (folder) {
      return folder.uri.fsPath;
    }
  }

  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
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

  const candidate = message as Partial<CouncilWebviewMessage>;
  if (
    candidate.type === 'refreshContext'
    || candidate.type === 'openFolder'
    || candidate.type === 'connectCodex'
    || candidate.type === 'disconnectCodex'
    || candidate.type === 'startCodexThread'
  ) {
    return true;
  }

  return candidate.type === 'copyPrompt'
    && typeof (candidate as Partial<CopyPromptMessage>).value === 'string';
}

function createNonce(): string {
  return randomBytes(18).toString('base64');
}

function renderLoadingHtml(nonce: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>Pets Council</title>
  <style>
    :root { color-scheme: light dark; font-family: var(--vscode-font-family); }
    body { margin: 0; padding: 32px; color: var(--vscode-foreground); background: var(--vscode-editor-background); }
    main { width: min(720px, 100%); margin: 0 auto; }
    p { color: var(--vscode-descriptionForeground); line-height: 1.6; }
  </style>
</head>
<body>
  <main>
    <h1>Capturing workspace context…</h1>
    <p>Reading the active editor and bounded Git state locally. Git inspection is read-only and time-limited; files and repository state are not modified.</p>
  </main>
</body>
</html>`;
}

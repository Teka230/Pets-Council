import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';
import { reviewMockTurn } from './mockCouncil';
import { renderCouncilHtml } from './webview';
import { captureLiveCouncilTurn } from './workspaceContext';

type CopyPromptMessage = Readonly<{
  type: 'copyPrompt';
  value: string;
}>;

type RefreshContextMessage = Readonly<{
  type: 'refreshContext';
}>;

type CouncilWebviewMessage = CopyPromptMessage | RefreshContextMessage;

export function activate(context: vscode.ExtensionContext): void {
  const openCouncil = vscode.commands.registerCommand(
    'petsCouncil.openCouncil',
    () => showCouncilPanel()
  );

  context.subscriptions.push(openCouncil);
}

export function deactivate(): void {
  // No long-lived resources yet.
}

function showCouncilPanel(): void {
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

  const renderLiveContext = async (): Promise<void> => {
    const currentSequence = ++renderSequence;
    panel.webview.html = renderLoadingHtml(createNonce());

    const turn = await captureLiveCouncilTurn();
    if (disposed || currentSequence !== renderSequence) {
      return;
    }

    const review = reviewMockTurn(turn);
    panel.webview.html = renderCouncilHtml(turn, review, createNonce());
  };

  const messageSubscription = panel.webview.onDidReceiveMessage(
    async (message: unknown) => {
      if (!isCouncilWebviewMessage(message)) {
        return;
      }

      if (message.type === 'refreshContext') {
        await renderLiveContext();
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
    messageSubscription.dispose();
  });

  void renderLiveContext();
}

function isCouncilWebviewMessage(message: unknown): message is CouncilWebviewMessage {
  if (typeof message !== 'object' || message === null) {
    return false;
  }

  const candidate = message as Partial<CouncilWebviewMessage>;
  if (candidate.type === 'refreshContext') {
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

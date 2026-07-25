import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';
import { reviewMockTurn } from './mockCouncil';
import { SAMPLE_COUNCIL_TURN } from './sampleTurn';
import { renderCouncilHtml } from './webview';

type CopyPromptMessage = Readonly<{
  type: 'copyPrompt';
  value: string;
}>;

export function activate(context: vscode.ExtensionContext): void {
  const openCouncil = vscode.commands.registerCommand(
    'petsCouncil.openCouncil',
    () => showCouncilPanel(context)
  );

  context.subscriptions.push(openCouncil);
}

export function deactivate(): void {
  // No long-lived resources yet.
}

function showCouncilPanel(context: vscode.ExtensionContext): void {
  const panel = vscode.window.createWebviewPanel(
    'petsCouncil.panel',
    'Pets Council',
    vscode.ViewColumn.Beside,
    {
      enableScripts: true,
      retainContextWhenHidden: true
    }
  );

  const review = reviewMockTurn(SAMPLE_COUNCIL_TURN);
  const nonce = randomBytes(18).toString('base64');
  panel.webview.html = renderCouncilHtml(SAMPLE_COUNCIL_TURN, review, nonce);

  const messageSubscription = panel.webview.onDidReceiveMessage(
    async (message: unknown) => {
      if (!isCopyPromptMessage(message)) {
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

  panel.onDidDispose(() => messageSubscription.dispose());
}

function isCopyPromptMessage(message: unknown): message is CopyPromptMessage {
  if (typeof message !== 'object' || message === null) {
    return false;
  }

  const candidate = message as Partial<CopyPromptMessage>;
  return candidate.type === 'copyPrompt' && typeof candidate.value === 'string';
}

import * as vscode from 'vscode';
import { buildCompanionSilencePolicies, formatCompanionSilenceReport } from './silenceTuning';
import type { SuggestionUsageSignalStore } from './usageSignalStore';

export async function openCompanionSilenceReport(store: SuggestionUsageSignalStore): Promise<void> {
  const policies = buildCompanionSilencePolicies(await store.read());
  const document = await vscode.workspace.openTextDocument({
    language: 'markdown',
    content: formatCompanionSilenceReport(policies)
  });
  await vscode.window.showTextDocument(document, { preview: false });
}

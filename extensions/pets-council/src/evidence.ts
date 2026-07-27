import type { CouncilTurn } from './domain';

export type CouncilEvidence = Readonly<{
  hasConversation: boolean;
  hasActiveFile: boolean;
  hasSelection: boolean;
  hasGitBranch: boolean;
  hasChangedFiles: boolean;
  hasDiffSummary: boolean;
}>;

export function inspectCouncilEvidence(turn: CouncilTurn): CouncilEvidence {
  const trustedConversation = turn.capture.mode === 'sample' || turn.runtime?.source === 'codex';
  return {
    hasConversation: trustedConversation && Boolean(turn.userMessage.trim() || turn.assistantResponse.trim()),
    hasActiveFile: Boolean(turn.workspace.activeFile),
    hasSelection: Boolean(turn.workspace.selectedText?.trim()),
    hasGitBranch: Boolean(turn.git?.branch),
    hasChangedFiles: (turn.git?.changedFiles.length ?? 0) > 0,
    hasDiffSummary: Boolean(turn.git?.diffSummary?.trim())
  };
}

export function hasUsefulCouncilEvidence(turn: CouncilTurn): boolean {
  return Object.values(inspectCouncilEvidence(turn)).some(Boolean);
}

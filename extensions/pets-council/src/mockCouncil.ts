import {
  COUNCIL_ROLE_IDS,
  type CouncilReview,
  type CouncilRoleId,
  type CouncilSuggestion,
  type CouncilTurn,
  emptyCouncilReview
} from './domain';
import { hasUsefulCouncilEvidence } from './evidence';

const MAX_SUGGESTIONS_PER_ROLE = 2;

export function reviewMockTurn(turn: CouncilTurn): CouncilReview {
  if (!hasUsefulCouncilEvidence(turn)) {
    return emptyCouncilReview(turn.turnId);
  }

  const suggestionsByRole: Record<CouncilRoleId, readonly CouncilSuggestion[]> = {
    architect: buildArchitectSuggestions(turn),
    guardian: buildGuardianSuggestions(turn),
    strategist: buildStrategistSuggestions(turn),
    notetaker: buildNotetakerSuggestions(turn)
  };

  return {
    turnId: turn.turnId,
    roles: COUNCIL_ROLE_IDS.map((role) => ({
      role,
      suggestions: suggestionsByRole[role].slice(0, MAX_SUGGESTIONS_PER_ROLE)
    }))
  };
}

function buildArchitectSuggestions(turn: CouncilTurn): readonly CouncilSuggestion[] {
  const activeFile = turn.workspace.activeFile;
  const changedFileCount = turn.git?.changedFiles.length ?? 0;
  const goal = summarize(turn.userMessage);
  const project = projectLabel(turn);

  if (!activeFile && changedFileCount === 0 && !turn.git?.branch && !turn.runtime && !turn.projectContext) {
    return [];
  }

  return [{
    id: `${turn.turnId}:architect:next-slice`,
    role: 'architect',
    title: activeFile ? `Continue from ${fileName(activeFile)}` : 'Choose the next bounded slice',
    rationale: activeFile
      ? `${activeFile} is active and ${changedFileCount} changed ${pluralize(changedFileCount, 'file')} were captured for this review.`
      : turn.git?.branch
        ? `The current Git branch ${turn.git.branch} provides a concrete checkpoint for the next slice.`
        : `The current goal is clear enough to form one bounded implementation slice: ${goal}`,
    prompt: [
      `Plan the next coherent implementation slice for ${project}.`,
      activeFile ? `Start from the active file ${activeFile}.` : '',
      turn.git?.branch ? `Use the current branch ${turn.git.branch} as the working checkpoint.` : '',
      changedFileCount > 0
        ? `Account for the ${changedFileCount} changed ${pluralize(changedFileCount, 'file')} in the current Git context.`
        : 'Keep the slice small enough to review independently.',
      'Stay inside the open workspace. Do not redirect work to another repository.',
      'Use the Shared Context Graph projection when it is relevant.',
      'Do not execute changes until the user explicitly sends the prepared prompt.'
    ].filter(Boolean).join(' '),
    actionLabel: 'Use in Codex'
  }];
}

function buildGuardianSuggestions(turn: CouncilTurn): readonly CouncilSuggestion[] {
  const suggestions: CouncilSuggestion[] = [];
  const changedFiles = turn.git?.changedFiles ?? [];
  const activeFile = turn.workspace.activeFile;
  const project = projectLabel(turn);

  if (changedFiles.length > 0) {
    suggestions.push({
      id: `${turn.turnId}:guardian:review-changes`,
      role: 'guardian',
      title: 'Review the changed surface',
      rationale: `${changedFiles.length} changed ${pluralize(changedFiles.length, 'file')} were captured${turn.git?.changedFilesTruncated ? ', with additional files omitted by the safety limit' : ''}.`,
      prompt: `Review the current ${project} changes for regressions, missing tests, and unclear assumptions. Prioritize these files: ${formatFileList(changedFiles)}. Report risks before proposing fixes.`,
      actionLabel: 'Use in Codex'
    });
  }

  if (turn.workspace.selectedText) {
    suggestions.push({
      id: `${turn.turnId}:guardian:review-selection`,
      role: 'guardian',
      title: 'Inspect the active selection',
      rationale: `The user explicitly selected ${turn.workspace.selectedText.length} characters${turn.workspace.selectedTextTruncated ? ' and the captured text was truncated' : ''}.`,
      prompt: `Review the active selection${activeFile ? ` in ${activeFile}` : ''}. Look for defects, unsafe assumptions, edge cases, and missing tests. Use the selected editor context without modifying the workspace automatically.`,
      actionLabel: 'Use in Codex'
    });
  } else if (activeFile) {
    suggestions.push({
      id: `${turn.turnId}:guardian:review-active-file`,
      role: 'guardian',
      title: `Inspect ${fileName(activeFile)}`,
      rationale: `${activeFile} is the active file in ${project}; a focused risk pass keeps the next edit bounded.`,
      prompt: `Review ${activeFile} in ${project} for defects, unsafe assumptions, edge cases, and missing tests. Stay inside the open workspace and do not modify files automatically.`,
      actionLabel: 'Use in Codex'
    });
  }

  return suggestions;
}

function buildStrategistSuggestions(turn: CouncilTurn): readonly CouncilSuggestion[] {
  const changedFiles = turn.git?.changedFiles.length ?? 0;
  if (changedFiles <= 3 && !turn.git?.changedFilesTruncated) return [];
  const project = projectLabel(turn);
  return [{
    id: `${turn.turnId}:strategist:split-scope`,
    role: 'strategist',
    title: 'Split the change before expanding it',
    rationale: turn.git?.changedFilesTruncated
      ? 'The changed-file list exceeded the bounded context limit.'
      : `${changedFiles} changed files make the current slice large enough to separate concerns.`,
    prompt: `Split the current ${project} work into reviewable vertical slices. Prefer one concern per slice while preserving a coherent path for the open workspace.`,
    actionLabel: 'Use in Codex'
  }];
}

function buildNotetakerSuggestions(turn: CouncilTurn): readonly CouncilSuggestion[] {
  const branch = turn.git?.branch;
  const durableConversation = turn.runtime?.source === 'codex' && Boolean(turn.assistantResponse.trim());
  if (!branch && !turn.git?.diffSummary && !durableConversation) return [];
  return [{
    id: `${turn.turnId}:notetaker:record-checkpoint`,
    role: 'notetaker',
    title: 'Preserve this checkpoint in the graph',
    rationale: branch
      ? `The Council reviewed branch ${branch}; the Greffier can preserve the accepted proposal and its provenance.`
      : 'The completed Codex exchange contains durable context worth preserving.',
    prompt: 'Summarize the durable decision, remaining question, and provenance from this checkpoint. Keep the note concise and do not claim that unaccepted suggestions became decisions.',
    actionLabel: 'Use in Codex'
  }];
}

function formatFileList(files: readonly string[]): string {
  const preview = files.slice(0, 5).join(', ');
  return files.length > 5 ? `${preview}, and ${files.length - 5} more` : preview;
}
function projectLabel(turn: CouncilTurn): string {
  const name = turn.workspace.name?.trim();
  return name || 'the open workspace';
}
function fileName(repositoryPath: string): string { return repositoryPath.split('/').filter(Boolean).at(-1) ?? repositoryPath; }
function pluralize(count: number, singular: string): string { return count === 1 ? singular : `${singular}s`; }
function summarize(value: string): string { const compact = value.replace(/\s+/g, ' ').trim(); return compact.length <= 120 ? compact : `${compact.slice(0, 117)}…`; }

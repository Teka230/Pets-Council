import {
  COUNCIL_ROLE_IDS,
  type CouncilReview,
  type CouncilRoleId,
  type CouncilSuggestion,
  type CouncilTurn
} from './domain';

const MAX_SUGGESTIONS_PER_ROLE = 2;

export function reviewMockTurn(turn: CouncilTurn): CouncilReview {
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

  return [
    {
      id: `${turn.turnId}:architect:next-slice`,
      role: 'architect',
      title: activeFile
        ? `Continue from ${fileName(activeFile)}`
        : 'Choose the next workspace slice',
      rationale: activeFile
        ? `${activeFile} is active and ${changedFileCount} changed ${pluralize(changedFileCount, 'file')} were captured for this review.`
        : `The current goal is clear enough to form one bounded implementation slice: ${goal}`,
      prompt: [
        'Plan the next coherent implementation slice for Pets Council.',
        activeFile ? `Start from the active file ${activeFile}.` : '',
        changedFileCount > 0
          ? `Account for the ${changedFileCount} changed ${pluralize(changedFileCount, 'file')} in the current Git context.`
          : 'Keep the slice small enough to review independently.',
        'Do not execute changes until the user explicitly confirms the next action.'
      ].filter(Boolean).join(' '),
      actionLabel: 'Prepare implementation prompt'
    }
  ];
}

function buildGuardianSuggestions(turn: CouncilTurn): readonly CouncilSuggestion[] {
  const suggestions: CouncilSuggestion[] = [];
  const changedFiles = turn.git?.changedFiles ?? [];
  const activeFile = turn.workspace.activeFile;

  if (changedFiles.length > 0) {
    const filePreview = formatFileList(changedFiles);
    suggestions.push({
      id: `${turn.turnId}:guardian:review-changes`,
      role: 'guardian',
      title: 'Review the changed surface',
      rationale: `${changedFiles.length} changed ${pluralize(changedFiles.length, 'file')} were captured${turn.git?.changedFilesTruncated ? ', with additional files omitted by the safety limit' : ''}.`,
      prompt: [
        'Review the current Pets Council changes for regressions, missing tests, and unclear assumptions.',
        `Prioritize these files: ${filePreview}.`,
        'Report risks before proposing fixes.'
      ].join(' '),
      actionLabel: 'Prepare change review'
    });
  }

  if (turn.workspace.selectedText) {
    suggestions.push({
      id: `${turn.turnId}:guardian:review-selection`,
      role: 'guardian',
      title: 'Inspect the active selection',
      rationale: `The user explicitly selected ${turn.workspace.selectedText.length} characters${turn.workspace.selectedTextTruncated ? ' and the captured text was truncated' : ''}.`,
      prompt: [
        `Review the active selection${activeFile ? ` in ${activeFile}` : ''}.`,
        'Look for defects, unsafe assumptions, edge cases, and missing tests.',
        'Use the selected editor context without modifying the workspace automatically.'
      ].join(' '),
      actionLabel: 'Prepare selection review'
    });
  } else if (activeFile) {
    suggestions.push({
      id: `${turn.turnId}:guardian:explicit-actions`,
      role: 'guardian',
      title: 'Keep actions explicit',
      rationale: `The council is connected to ${activeFile}; suggestions must prepare text without modifying the workspace or running commands.`,
      prompt: [
        'Review the council interaction boundary.',
        'Confirm that suggestion clicks only prepare editable text,',
        'and that no workspace write or command runs without a separate user action.'
      ].join(' '),
      actionLabel: 'Prepare safety review'
    });
  }

  return suggestions;
}

function buildStrategistSuggestions(turn: CouncilTurn): readonly CouncilSuggestion[] {
  const changedFiles = turn.git?.changedFiles.length ?? 0;
  const changedFilesTruncated = turn.git?.changedFilesTruncated === true;

  if (changedFiles <= 3 && !changedFilesTruncated) {
    return [];
  }

  return [
    {
      id: `${turn.turnId}:strategist:split-scope`,
      role: 'strategist',
      title: 'Split the change before expanding it',
      rationale: changedFilesTruncated
        ? 'The changed-file list exceeded the bounded context limit, so the current scope should be reduced before deeper work.'
        : `${changedFiles} changed files make the current slice large enough to separate concerns.`,
      prompt: [
        'Split the current Pets Council work into reviewable vertical slices.',
        'Separate context capture, council behavior, and UI presentation where possible.',
        'Keep each PR independently testable.'
      ].join(' '),
      actionLabel: 'Prepare sequencing prompt'
    }
  ];
}

function buildNotetakerSuggestions(turn: CouncilTurn): readonly CouncilSuggestion[] {
  const branch = turn.git?.branch;
  const diffSummary = turn.git?.diffSummary;

  if (!branch && !diffSummary && !turn.assistantResponse.trim()) {
    return [];
  }

  return [
    {
      id: `${turn.turnId}:notetaker:record-checkpoint`,
      role: 'notetaker',
      title: 'Record the workspace checkpoint',
      rationale: branch
        ? `The council reviewed live context from branch ${branch}; preserving the decision boundary will help the next session resume safely.`
        : 'The current response establishes context worth preserving for the next session.',
      prompt: [
        'Prepare a concise project note for this Pets Council checkpoint.',
        branch ? `Include the current branch: ${branch}.` : '',
        diffSummary ? 'Summarize the captured Git diff at decision level, not line by line.' : '',
        'Preserve the rule that council suggestions never execute automatically.'
      ].filter(Boolean).join(' '),
      actionLabel: 'Prepare project note'
    }
  ];
}

function formatFileList(files: readonly string[]): string {
  const preview = files.slice(0, 5).join(', ');
  return files.length > 5 ? `${preview}, and ${files.length - 5} more` : preview;
}

function fileName(repositoryPath: string): string {
  return repositoryPath.split('/').filter(Boolean).at(-1) ?? repositoryPath;
}

function pluralize(count: number, singular: string): string {
  return count === 1 ? singular : `${singular}s`;
}

function summarize(value: string): string {
  const compact = value.replace(/\s+/g, ' ').trim();
  return compact.length <= 120 ? compact : `${compact.slice(0, 117)}…`;
}

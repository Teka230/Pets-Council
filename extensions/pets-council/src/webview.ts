import {
  COUNCIL_ROLES,
  type CouncilReview,
  type CouncilRoleDefinition,
  type CouncilRoleId,
  type CouncilRoleReview,
  type CouncilSuggestion,
  type CouncilTurn
} from './domain';
import { hasUsefulCouncilEvidence } from './evidence';

const EMPTY_ROLE_STATUS: Record<CouncilRoleId, string> = {
  architect: 'Waiting for project context',
  guardian: 'Nothing to review',
  strategist: 'Nothing to sequence',
  notetaker: 'Nothing to preserve'
};

export function renderCouncilHtml(
  turn: CouncilTurn,
  review: CouncilReview,
  nonce: string
): string {
  if (!hasUsefulCouncilEvidence(turn)) {
    return renderEmptyStateHtml(turn, review, nonce);
  }

  const activeRoles = review.roles.filter((role) => role.suggestions.length > 0).length;
  const suggestionCount = countSuggestions(review);
  const roleDefinitions = roleDefinitionMap();
  const roleCards = review.roles
    .map((roleReview) => renderRoleCard(roleReview, roleDefinitions.get(roleReview.role)))
    .join('');

  return renderDocument({
    nonce,
    body: `
      <main>
        <div class="header-row">
          <div>
            <p class="eyebrow">Live council review</p>
            <h1>${activeRoles} ${pluralize(activeRoles, 'companion')} ${activeRoles === 1 ? 'has' : 'have'} something useful to add.</h1>
          </div>
          <button class="action secondary" id="refresh-context" type="button">Refresh context</button>
        </div>
        <p class="promise">
          The local capture produced ${suggestionCount} ${pluralize(suggestionCount, 'suggestion')} from concrete editor or Git evidence.
          Choose one to prepare the next prompt; nothing executes automatically.
        </p>
        ${renderContextPills(turn)}
        <p class="privacy-note">
          Pets Council does not scan file contents in this slice. Only text explicitly selected in the editor may be captured, up to 2,000 characters.
        </p>
        ${renderWarnings(turn.capture.warnings)}
        <section class="roles" aria-label="Council suggestions">${roleCards}</section>
        ${renderComposer()}
      </main>`,
    script: renderInteractiveScript()
  });
}

function renderEmptyStateHtml(
  turn: CouncilTurn,
  review: CouncilReview,
  nonce: string
): string {
  const roleDefinitions = roleDefinitionMap();
  const roleCards = review.roles
    .map((roleReview) => renderEmptyRoleCard(roleReview, roleDefinitions.get(roleReview.role)))
    .join('');

  return renderDocument({
    nonce,
    body: `
      <main>
        <p class="eyebrow">Council waiting</p>
        <section class="empty-state" aria-labelledby="empty-title">
          <h1 id="empty-title">No project context yet</h1>
          <p class="promise">
            Open a folder or workspace so the Council can review the active file, an explicit selection,
            the current Git branch, and bounded change statistics.
          </p>
          <div class="empty-actions">
            <button class="action" id="open-folder" type="button">Open folder</button>
            <button class="action secondary" id="refresh-context" type="button">Refresh context</button>
          </div>
          <p class="empty-note">
            The Council stays silent until it has concrete evidence. Captured locally at ${escapeHtml(formatCapturedAt(turn.capture.capturedAt))}.
          </p>
        </section>
        <section class="roles" aria-label="Council waiting states">${roleCards}</section>
      </main>`,
    script: renderEmptyStateScript()
  });
}

function renderDocument(input: Readonly<{
  nonce: string;
  body: string;
  script: string;
}>): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${escapeHtml(input.nonce)}';">
  <title>Pets Council</title>
  <style>${styles()}</style>
</head>
<body>
  ${input.body}
  <script nonce="${escapeHtml(input.nonce)}">${input.script}</script>
</body>
</html>`;
}

function styles(): string {
  return `
    :root { color-scheme: light dark; font-family: var(--vscode-font-family); }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 24px; color: var(--vscode-foreground); background: var(--vscode-editor-background); }
    button, textarea { font: inherit; }
    main { width: min(920px, 100%); margin: 0 auto; }
    .header-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; }
    .eyebrow { margin: 0 0 8px; color: var(--vscode-descriptionForeground); font-size: 12px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
    h1 { max-width: 760px; margin: 0; font-size: clamp(30px, 5vw, 52px); line-height: 1.05; }
    .promise { max-width: 760px; margin: 16px 0 20px; color: var(--vscode-descriptionForeground); font-size: 16px; line-height: 1.6; }
    .turn-context { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 14px; }
    .context-pill { padding: 6px 10px; border: 1px solid var(--vscode-panel-border); border-radius: 999px; color: var(--vscode-descriptionForeground); background: var(--vscode-sideBar-background); font-size: 12px; }
    .privacy-note, .empty-note { margin: 0 0 22px; color: var(--vscode-descriptionForeground); font-size: 12px; line-height: 1.5; }
    .warnings { margin: 0 0 22px; padding: 10px 12px; border: 1px solid var(--vscode-inputValidation-warningBorder, var(--vscode-panel-border)); border-radius: 10px; background: var(--vscode-inputValidation-warningBackground, var(--vscode-sideBar-background)); }
    .warnings summary { cursor: pointer; font-weight: 700; }
    .warnings ul { margin: 10px 0 0; padding-left: 20px; }
    .warnings li { margin: 5px 0; color: var(--vscode-descriptionForeground); }
    .empty-state { margin-bottom: 22px; padding: 24px; border: 1px solid var(--vscode-panel-border); border-radius: 18px; background: var(--vscode-sideBar-background); }
    .empty-actions, .composer__actions { display: flex; flex-wrap: wrap; gap: 8px; }
    .empty-note { margin: 16px 0 0; }
    .roles { display: grid; gap: 14px; }
    .role { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 14px; padding: 18px; border: 1px solid var(--vscode-panel-border); border-radius: 16px; background: var(--vscode-sideBar-background); }
    .role--silent { opacity: .72; }
    .role__icon { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 13px; background: var(--vscode-badge-background); font-size: 22px; }
    .role__heading { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 8px; }
    .role__name { margin: 2px 0 0; font-size: 18px; font-weight: 700; }
    .role__status { color: var(--vscode-descriptionForeground); font-size: 12px; font-weight: 700; text-transform: uppercase; }
    .role__purpose { margin: 8px 0 0; color: var(--vscode-descriptionForeground); line-height: 1.45; }
    .suggestions { display: grid; gap: 10px; margin-top: 16px; }
    .suggestion { padding: 14px; border: 1px solid var(--vscode-panel-border); border-radius: 12px; background: var(--vscode-editor-background); }
    .suggestion.is-selected { border-color: var(--vscode-focusBorder); outline: 1px solid var(--vscode-focusBorder); }
    .suggestion__title { margin: 0; font-size: 15px; font-weight: 700; }
    .suggestion__rationale { margin: 7px 0 12px; color: var(--vscode-descriptionForeground); line-height: 1.5; }
    .silent-message { margin: 14px 0 0; color: var(--vscode-descriptionForeground); font-style: italic; }
    .action { padding: 7px 11px; border: 1px solid var(--vscode-button-border, transparent); border-radius: 6px; color: var(--vscode-button-foreground); background: var(--vscode-button-background); cursor: pointer; }
    .action:hover { background: var(--vscode-button-hoverBackground); }
    .secondary { color: var(--vscode-foreground); background: transparent; border-color: var(--vscode-panel-border); }
    .composer { position: sticky; bottom: 14px; margin-top: 22px; padding: 16px; border: 1px solid var(--vscode-panel-border); border-radius: 16px; background: var(--vscode-editorWidget-background); box-shadow: 0 12px 32px rgb(0 0 0 / 20%); }
    .composer__label { display: block; margin-bottom: 8px; font-weight: 700; }
    textarea { width: 100%; min-height: 118px; resize: vertical; padding: 12px; border: 1px solid var(--vscode-input-border, var(--vscode-panel-border)); border-radius: 8px; color: var(--vscode-input-foreground); background: var(--vscode-input-background); line-height: 1.5; }
    textarea:focus, button:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 2px; }
    .composer__footer { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; margin-top: 10px; }
    .status { margin: 0; color: var(--vscode-descriptionForeground); font-size: 12px; }
    @media (max-width: 620px) { body { padding: 16px; } .header-row { display: block; } .header-row > button { margin-top: 14px; } .role { grid-template-columns: 1fr; } }
  `;
}

function renderContextPills(turn: CouncilTurn): string {
  return `
    <div class="turn-context" aria-label="Captured workspace context">
      <span class="context-pill">${turn.capture.mode === 'live' ? 'Live workspace' : 'Sample context'}</span>
      ${turn.workspace.name ? `<span class="context-pill">${escapeHtml(turn.workspace.name)}</span>` : ''}
      ${turn.workspace.activeFile ? `<span class="context-pill">${escapeHtml(turn.workspace.activeFile)}</span>` : ''}
      ${turn.workspace.selectedText ? `<span class="context-pill">Selection: ${turn.workspace.selectedText.length} chars${turn.workspace.selectedTextTruncated ? '+' : ''}</span>` : ''}
      ${turn.git?.branch ? `<span class="context-pill">${escapeHtml(turn.git.branch)}</span>` : ''}
      ${turn.git?.changedFiles.length ? `<span class="context-pill">${turn.git.changedFiles.length}${turn.git.changedFilesTruncated ? '+' : ''} changed ${pluralize(turn.git.changedFiles.length, 'file')}</span>` : ''}
      <span class="context-pill">Captured ${escapeHtml(formatCapturedAt(turn.capture.capturedAt))}</span>
    </div>`;
}

function renderComposer(): string {
  return `
    <section class="composer" aria-label="Prepared prompt">
      <label class="composer__label" for="council-composer">Prepared next prompt</label>
      <textarea id="council-composer" placeholder="Choose a council suggestion to prepare the next prompt..."></textarea>
      <div class="composer__footer">
        <p class="status" id="composer-status" aria-live="polite">No suggestion selected.</p>
        <div class="composer__actions">
          <button class="action secondary" id="clear-prompt" type="button">Clear</button>
          <button class="action" id="copy-prompt" type="button">Copy prompt</button>
        </div>
      </div>
    </section>`;
}

function renderRoleCard(
  roleReview: CouncilRoleReview,
  role: CouncilRoleDefinition | undefined
): string {
  if (!role) {
    throw new Error(`Missing definition for council role: ${roleReview.role}`);
  }

  const suggestionCount = roleReview.suggestions.length;
  const status = suggestionCount === 0
    ? 'Nothing to add'
    : `${suggestionCount} ${pluralize(suggestionCount, 'suggestion')}`;
  const content = suggestionCount === 0
    ? '<p class="silent-message">This companion found no useful addition for this turn.</p>'
    : `<div class="suggestions">${roleReview.suggestions.map((suggestion) => renderSuggestion(suggestion, role)).join('')}</div>`;

  return renderRoleShell(role, status, content, suggestionCount === 0);
}

function renderEmptyRoleCard(
  roleReview: CouncilRoleReview,
  role: CouncilRoleDefinition | undefined
): string {
  if (!role) {
    throw new Error(`Missing definition for council role: ${roleReview.role}`);
  }

  return renderRoleShell(
    role,
    EMPTY_ROLE_STATUS[roleReview.role],
    '<p class="silent-message">No concrete signal is available for this companion yet.</p>',
    true
  );
}

function renderRoleShell(
  role: CouncilRoleDefinition,
  status: string,
  content: string,
  silent: boolean
): string {
  return `
    <article class="role${silent ? ' role--silent' : ''}">
      <div class="role__icon" aria-hidden="true">${role.icon}</div>
      <div>
        <div class="role__heading">
          <p class="role__name">${escapeHtml(role.name)}</p>
          <span class="role__status">${escapeHtml(status)}</span>
        </div>
        <p class="role__purpose">${escapeHtml(role.purpose)}</p>
        ${content}
      </div>
    </article>`;
}

function renderSuggestion(
  suggestion: CouncilSuggestion,
  role: CouncilRoleDefinition
): string {
  return `
    <article class="suggestion">
      <p class="suggestion__title">${escapeHtml(suggestion.title)}</p>
      <p class="suggestion__rationale">${escapeHtml(suggestion.rationale)}</p>
      <button class="action" type="button" data-role="${escapeHtml(role.name)}" data-prompt="${escapeHtml(suggestion.prompt)}">${escapeHtml(suggestion.actionLabel)}</button>
    </article>`;
}

function renderWarnings(warnings: readonly string[]): string {
  if (warnings.length === 0) {
    return '';
  }

  return `
    <details class="warnings">
      <summary>${warnings.length} context ${pluralize(warnings.length, 'warning')}</summary>
      <ul>${warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join('')}</ul>
    </details>`;
}

function renderInteractiveScript(): string {
  return `
    const vscode = acquireVsCodeApi();
    const composer = document.getElementById('council-composer');
    const status = document.getElementById('composer-status');
    const savedState = vscode.getState();

    if (savedState && typeof savedState.draft === 'string') {
      composer.value = savedState.draft;
      status.textContent = savedState.draft ? 'Restored the prepared prompt.' : 'No suggestion selected.';
    }

    document.querySelectorAll('[data-prompt]').forEach((button) => {
      button.addEventListener('click', () => {
        const prompt = button.dataset.prompt || '';
        const role = button.dataset.role || 'Council';
        composer.value = prompt;
        composer.focus();
        vscode.setState({ draft: prompt });
        status.textContent = 'Prepared from ' + role + '. Review it before copying.';
        document.querySelectorAll('.suggestion').forEach((item) => item.classList.remove('is-selected'));
        button.closest('.suggestion')?.classList.add('is-selected');
      });
    });

    composer.addEventListener('input', () => {
      vscode.setState({ draft: composer.value });
      status.textContent = composer.value.trim() ? 'Prompt edited locally. Nothing has run.' : 'No suggestion selected.';
    });

    document.getElementById('copy-prompt').addEventListener('click', () => {
      const value = composer.value.trim();
      if (!value) {
        status.textContent = 'Choose or write a prompt before copying.';
        return;
      }
      vscode.postMessage({ type: 'copyPrompt', value });
      status.textContent = 'Copy requested. Nothing has run.';
    });

    document.getElementById('refresh-context').addEventListener('click', () => {
      status.textContent = 'Refreshing the local workspace context…';
      vscode.postMessage({ type: 'refreshContext' });
    });

    document.getElementById('clear-prompt').addEventListener('click', () => {
      composer.value = '';
      vscode.setState({ draft: '' });
      status.textContent = 'Prepared prompt cleared.';
      document.querySelectorAll('.suggestion').forEach((item) => item.classList.remove('is-selected'));
      composer.focus();
    });
  `;
}

function renderEmptyStateScript(): string {
  return `
    const vscode = acquireVsCodeApi();
    document.getElementById('open-folder').addEventListener('click', () => {
      vscode.postMessage({ type: 'openFolder' });
    });
    document.getElementById('refresh-context').addEventListener('click', () => {
      vscode.postMessage({ type: 'refreshContext' });
    });
  `;
}

function roleDefinitionMap(): Map<CouncilRoleId, CouncilRoleDefinition> {
  return new Map(COUNCIL_ROLES.map((role) => [role.id, role]));
}

function countSuggestions(review: CouncilReview): number {
  return review.roles.reduce((total, role) => total + role.suggestions.length, 0);
}

export function formatCapturedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(date);
}

function pluralize(count: number, singular: string): string {
  return count === 1 ? singular : `${singular}s`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

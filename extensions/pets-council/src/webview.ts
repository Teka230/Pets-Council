import {
  COUNCIL_ROLES,
  type CouncilReview,
  type CouncilRoleDefinition,
  type CouncilRoleReview,
  type CouncilSuggestion,
  type CouncilTurn
} from './domain';

export function renderLoadingHtml(nonce: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${escapeHtml(nonce)}';">
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
    <p>Reading the active editor and a bounded Git summary locally. No file is modified and no command is executed on your behalf.</p>
  </main>
</body>
</html>`;
}

export function renderCouncilHtml(
  turn: CouncilTurn,
  review: CouncilReview,
  nonce: string
): string {
  const activeRoles = review.roles.filter((role) => role.suggestions.length > 0).length;
  const suggestionCount = review.roles.reduce(
    (total, role) => total + role.suggestions.length,
    0
  );
  const roleDefinitions = new Map(COUNCIL_ROLES.map((role) => [role.id, role]));
  const roleCards = review.roles
    .map((roleReview) => renderRoleCard(roleReview, roleDefinitions.get(roleReview.role)))
    .join('');
  const warnings = renderWarnings(turn.capture.warnings);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${escapeHtml(nonce)}';">
  <title>Pets Council</title>
  <style>
    :root {
      color-scheme: light dark;
      font-family: var(--vscode-font-family);
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      padding: 24px;
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
    }

    button,
    textarea { font: inherit; }

    main {
      width: min(920px, 100%);
      margin: 0 auto;
    }

    .header-row {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 18px;
    }

    .eyebrow {
      margin: 0 0 8px;
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }

    h1 {
      max-width: 760px;
      margin: 0;
      font-size: clamp(30px, 5vw, 52px);
      line-height: 1.05;
    }

    .promise {
      max-width: 760px;
      margin: 16px 0 20px;
      color: var(--vscode-descriptionForeground);
      font-size: 16px;
      line-height: 1.6;
    }

    .turn-context {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 14px;
    }

    .context-pill {
      padding: 6px 10px;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 999px;
      color: var(--vscode-descriptionForeground);
      background: var(--vscode-sideBar-background);
      font-size: 12px;
    }

    .privacy-note {
      margin: 0 0 22px;
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
      line-height: 1.5;
    }

    .warnings {
      margin: 0 0 22px;
      padding: 10px 12px;
      border: 1px solid var(--vscode-inputValidation-warningBorder, var(--vscode-panel-border));
      border-radius: 10px;
      background: var(--vscode-inputValidation-warningBackground, var(--vscode-sideBar-background));
    }

    .warnings summary { cursor: pointer; font-weight: 700; }
    .warnings ul { margin: 10px 0 0; padding-left: 20px; }
    .warnings li { margin: 5px 0; color: var(--vscode-descriptionForeground); }

    .roles {
      display: grid;
      gap: 14px;
    }

    .role {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      gap: 14px;
      padding: 18px;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 16px;
      background: var(--vscode-sideBar-background);
    }

    .role--silent { opacity: 0.72; }

    .role__icon {
      display: grid;
      place-items: center;
      width: 44px;
      height: 44px;
      border-radius: 13px;
      background: var(--vscode-badge-background);
      font-size: 22px;
    }

    .role__heading {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      justify-content: space-between;
      gap: 8px;
    }

    .role__name {
      margin: 2px 0 0;
      font-size: 18px;
      font-weight: 700;
    }

    .role__status {
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
    }

    .role__purpose {
      margin: 8px 0 0;
      color: var(--vscode-descriptionForeground);
      line-height: 1.45;
    }

    .suggestions {
      display: grid;
      gap: 10px;
      margin-top: 16px;
    }

    .suggestion {
      padding: 14px;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 12px;
      background: var(--vscode-editor-background);
    }

    .suggestion.is-selected {
      border-color: var(--vscode-focusBorder);
      outline: 1px solid var(--vscode-focusBorder);
    }

    .suggestion__title {
      margin: 0;
      font-size: 15px;
      font-weight: 700;
    }

    .suggestion__rationale {
      margin: 7px 0 12px;
      color: var(--vscode-descriptionForeground);
      line-height: 1.5;
    }

    .silent-message {
      margin: 14px 0 0;
      color: var(--vscode-descriptionForeground);
      font-style: italic;
    }

    .action {
      padding: 7px 11px;
      border: 1px solid var(--vscode-button-border, transparent);
      border-radius: 6px;
      color: var(--vscode-button-foreground);
      background: var(--vscode-button-background);
      cursor: pointer;
    }

    .action:hover { background: var(--vscode-button-hoverBackground); }

    .secondary {
      color: var(--vscode-foreground);
      background: transparent;
      border-color: var(--vscode-panel-border);
    }

    .composer {
      position: sticky;
      bottom: 14px;
      margin-top: 22px;
      padding: 16px;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 16px;
      background: var(--vscode-editorWidget-background);
      box-shadow: 0 12px 32px rgb(0 0 0 / 20%);
    }

    .composer__label {
      display: block;
      margin-bottom: 8px;
      font-weight: 700;
    }

    textarea {
      width: 100%;
      min-height: 118px;
      resize: vertical;
      padding: 12px;
      border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
      border-radius: 8px;
      color: var(--vscode-input-foreground);
      background: var(--vscode-input-background);
      line-height: 1.5;
    }

    textarea:focus,
    button:focus-visible {
      outline: 1px solid var(--vscode-focusBorder);
      outline-offset: 2px;
    }

    .composer__footer {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      margin-top: 10px;
    }

    .composer__actions {
      display: flex;
      gap: 8px;
    }

    .status {
      margin: 0;
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
    }

    @media (max-width: 620px) {
      body { padding: 16px; }
      .header-row { display: block; }
      .header-row > button { margin-top: 14px; }
      .role { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <main>
    <div class="header-row">
      <div>
        <p class="eyebrow">Live council review</p>
        <h1>${activeRoles} companions have something useful to add.</h1>
      </div>
      <button class="action secondary" id="refresh-context" type="button">Refresh context</button>
    </div>
    <p class="promise">
      The local capture produced ${suggestionCount} ${pluralize(suggestionCount, 'suggestion')} from the active editor and bounded Git state.
      Choose one to prepare the next prompt; nothing executes automatically.
    </p>
    <div class="turn-context" aria-label="Captured workspace context">
      <span class="context-pill">${turn.capture.mode === 'live' ? 'Live workspace' : 'Sample context'}</span>
      <span class="context-pill">${escapeHtml(turn.workspace.name ?? 'Untitled workspace')}</span>
      ${turn.workspace.activeFile ? `<span class="context-pill">${escapeHtml(turn.workspace.activeFile)}</span>` : '<span class="context-pill">No active editor</span>'}
      ${turn.workspace.selectedText ? `<span class="context-pill">Selection: ${turn.workspace.selectedText.length} chars${turn.workspace.selectedTextTruncated ? '+' : ''}</span>` : ''}
      ${turn.git?.branch ? `<span class="context-pill">${escapeHtml(turn.git.branch)}</span>` : '<span class="context-pill">No Git branch</span>'}
      ${turn.git ? `<span class="context-pill">${turn.git.changedFiles.length}${turn.git.changedFilesTruncated ? '+' : ''} changed ${pluralize(turn.git.changedFiles.length, 'file')}</span>` : ''}
      <span class="context-pill">Captured ${escapeHtml(formatCapturedAt(turn.capture.capturedAt))}</span>
    </div>
    <p class="privacy-note">
      Pets Council does not scan file contents in this slice. Only text explicitly selected in the editor may be captured, up to 2,000 characters.
    </p>
    ${warnings}
    <section class="roles" aria-label="Council suggestions">
      ${roleCards}
    </section>
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
    </section>
  </main>
  <script nonce="${escapeHtml(nonce)}">
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

        document.querySelectorAll('.suggestion').forEach((suggestion) => {
          suggestion.classList.remove('is-selected');
        });
        button.closest('.suggestion')?.classList.add('is-selected');
      });
    });

    composer.addEventListener('input', () => {
      vscode.setState({ draft: composer.value });
      status.textContent = composer.value.trim()
        ? 'Prompt edited locally. Nothing has run.'
        : 'No suggestion selected.';
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
      document.querySelectorAll('.suggestion').forEach((suggestion) => {
        suggestion.classList.remove('is-selected');
      });
      composer.focus();
    });
  </script>
</body>
</html>`;
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

  return `
    <article class="role${suggestionCount === 0 ? ' role--silent' : ''}">
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
      <button
        class="action"
        type="button"
        data-role="${escapeHtml(role.name)}"
        data-prompt="${escapeHtml(suggestion.prompt)}"
      >${escapeHtml(suggestion.actionLabel)}</button>
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

function formatCapturedAt(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : `${date.toISOString().slice(11, 19)} UTC`;
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

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
import type { CodexRuntimeStatus } from './runtime/types';

const EMPTY_ROLE_STATUS: Record<CouncilRoleId, string> = {
  architect: 'Waiting for project context',
  guardian: 'Nothing to review',
  strategist: 'Nothing to sequence',
  notetaker: 'Nothing to preserve'
};

export function renderCouncilHtml(
  turn: CouncilTurn,
  review: CouncilReview,
  runtime: CodexRuntimeStatus,
  nonce: string
): string {
  if (!hasUsefulCouncilEvidence(turn)) {
    return renderEmptyStateHtml(turn, review, runtime, nonce);
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
        ${renderRuntimeCard(runtime)}
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
  runtime: CodexRuntimeStatus,
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
          <div class="button-row">
            <button class="action" id="open-folder" type="button">Open folder</button>
            <button class="action secondary" id="refresh-context" type="button">Refresh context</button>
          </div>
          <p class="empty-note">
            The Council stays silent until it has concrete evidence. Captured locally at ${escapeHtml(formatCapturedAt(turn.capture.capturedAt))}.
          </p>
        </section>
        ${renderRuntimeCard(runtime)}
        <section class="roles" aria-label="Council waiting states">${roleCards}</section>
      </main>`,
    script: renderEmptyStateScript()
  });
}

function renderRuntimeCard(runtime: CodexRuntimeStatus): string {
  const readyMetadata = runtime.phase === 'ready'
    ? [runtime.server?.userAgent, runtime.server?.platformFamily, runtime.server?.platformOs]
      .filter((value): value is string => Boolean(value))
      .join(' · ')
    : '';
  const thread = runtime.thread.thread;
  const threadMetadata = thread
    ? [
      `Thread ${shortId(thread.id)}`,
      thread.model,
      thread.modelProvider,
      thread.cwd
    ].filter((value): value is string => Boolean(value)).join(' · ')
    : '';

  return `
    <section class="runtime runtime--${runtime.phase}" aria-label="Codex runtime status">
      <div>
        <p class="runtime__eyebrow">Codex runtime</p>
        <p class="runtime__title">${escapeHtml(runtimeLabel(runtime))}</p>
        <p class="runtime__message">${escapeHtml(runtime.message)}</p>
        ${runtime.phase === 'ready' ? `<p class="runtime__thread">${escapeHtml(runtime.thread.message)}</p>` : ''}
        <p class="runtime__metadata">
          Binary: ${escapeHtml(runtime.binary)}${readyMetadata ? ` · ${escapeHtml(readyMetadata)}` : ''}${threadMetadata ? `<br>${escapeHtml(threadMetadata)}` : ''}
        </p>
      </div>
      <div class="runtime__actions">${renderRuntimeActions(runtime)}</div>
    </section>`;
}

function renderRuntimeActions(runtime: CodexRuntimeStatus): string {
  if (runtime.phase === 'connecting') {
    return '<button class="action secondary" type="button" disabled>Connecting…</button>';
  }

  if (runtime.phase !== 'ready') {
    return `<button class="action" id="connect-codex" type="button">${runtime.phase === 'error' ? 'Retry connection' : 'Connect Codex'}</button>`;
  }

  const startLabel = runtime.thread.phase === 'ready' ? 'New Codex session' : 'Start Codex session';
  const startButton = runtime.thread.phase === 'starting'
    ? '<button class="action" type="button" disabled>Starting session…</button>'
    : `<button class="action" id="start-codex-thread" type="button">${startLabel}</button>`;

  return `${startButton}<button class="action secondary" id="disconnect-codex" type="button">Disconnect</button>`;
}

function runtimeLabel(runtime: CodexRuntimeStatus): string {
  switch (runtime.phase) {
    case 'connecting':
      return 'Connecting to app-server';
    case 'ready':
      return runtime.thread.phase === 'ready' ? 'Thread ready' : 'Handshake complete';
    case 'error':
      return 'Connection failed';
    default:
      return 'Not connected';
  }
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
    button:disabled { cursor: wait; opacity: .7; }
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
    .empty-state { margin-bottom: 16px; padding: 24px; border: 1px solid var(--vscode-panel-border); border-radius: 18px; background: var(--vscode-sideBar-background); }
    .button-row, .composer__actions, .runtime__actions { display: flex; flex-wrap: wrap; gap: 8px; }
    .empty-note { margin: 16px 0 0; }
    .runtime { display: flex; align-items: center; justify-content: space-between; gap: 18px; margin: 0 0 22px; padding: 16px; border: 1px solid var(--vscode-panel-border); border-radius: 14px; background: var(--vscode-editorWidget-background); }
    .runtime--ready { border-color: var(--vscode-testing-iconPassed, var(--vscode-focusBorder)); }
    .runtime--error { border-color: var(--vscode-inputValidation-errorBorder, var(--vscode-errorForeground)); }
    .runtime__eyebrow { margin: 0 0 4px; color: var(--vscode-descriptionForeground); font-size: 11px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; }
    .runtime__title { margin: 0; font-weight: 700; }
    .runtime__message, .runtime__thread { margin: 5px 0 0; color: var(--vscode-descriptionForeground); line-height: 1.45; }
    .runtime__thread { color: var(--vscode-foreground); }
    .runtime__metadata { margin: 7px 0 0; color: var(--vscode-descriptionForeground); font-family: var(--vscode-editor-font-family); font-size: 11px; line-height: 1.5; }
    .runtime__actions { flex: 0 0 auto; justify-content: flex-end; }
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
    .action:hover:not(:disabled) { background: var(--vscode-button-hoverBackground); }
    .secondary { color: var(--vscode-foreground); background: transparent; border-color: var(--vscode-panel-border); }
    .composer { position: sticky; bottom: 14px; margin-top: 22px; padding: 16px; border: 1px solid var(--vscode-panel-border); border-radius: 16px; background: var(--vscode-editorWidget-background); box-shadow: 0 12px 32px rgb(0 0 0 / 20%); }
    .composer__label { display: block; margin-bottom: 8px; font-weight: 700; }
    textarea { width: 100%; min-height: 118px; resize: vertical; padding: 12px; border: 1px solid var(--vscode-input-border, var(--vscode-panel-border)); border-radius: 8px; color: var(--vscode-input-foreground); background: var(--vscode-input-background); line-height: 1.5; }
    textarea:focus, button:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 2px; }
    .composer__footer { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; margin-top: 10px; }
    .status { margin: 0; color: var(--vscode-descriptionForeground); font-size: 12px; }
    @media (max-width: 620px) { body { padding: 16px; } .header-row, .runtime { display: block; } .header-row > button, .runtime__actions { margin-top: 14px; justify-content: flex-start; } .role { grid-template-columns: 1fr; } }
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
    ${renderRuntimeScript()}
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
    ${renderRuntimeScript()}
    document.getElementById('open-folder').addEventListener('click', () => {
      vscode.postMessage({ type: 'openFolder' });
    });
    document.getElementById('refresh-context').addEventListener('click', () => {
      vscode.postMessage({ type: 'refreshContext' });
    });
  `;
}

function renderRuntimeScript(): string {
  return `
    const connectCodex = document.getElementById('connect-codex');
    if (connectCodex) {
      connectCodex.addEventListener('click', () => vscode.postMessage({ type: 'connectCodex' }));
    }
    const disconnectCodex = document.getElementById('disconnect-codex');
    if (disconnectCodex) {
      disconnectCodex.addEventListener('click', () => vscode.postMessage({ type: 'disconnectCodex' }));
    }
    const startCodexThread = document.getElementById('start-codex-thread');
    if (startCodexThread) {
      startCodexThread.addEventListener('click', () => vscode.postMessage({ type: 'startCodexThread' }));
    }
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

function shortId(value: string): string {
  return value.length <= 12 ? value : `${value.slice(0, 8)}…${value.slice(-4)}`;
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

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
  const evidence = hasUsefulCouncilEvidence(turn);
  const body = evidence
    ? renderActiveCouncil(turn, review, runtime)
    : renderEmptyCouncil(turn, review, runtime);
  return renderDocument(body, nonce, evidence ? renderInteractiveScript() : renderEmptyScript());
}

function renderActiveCouncil(
  turn: CouncilTurn,
  review: CouncilReview,
  runtime: CodexRuntimeStatus
): string {
  const activeRoles = review.roles.filter((role) => role.suggestions.length > 0).length;
  const suggestions = review.roles.reduce((count, role) => count + role.suggestions.length, 0);
  return `
    <main>
      <div class="header-row">
        <div><p class="eyebrow">Live workspace</p><h1>Pets Council</h1></div>
        <button class="action secondary" id="refresh-context" type="button">Refresh context</button>
      </div>
      ${renderRuntime(runtime)}
      ${renderCodexConversation(runtime)}
      <section class="council-intro">
        <p class="eyebrow">Deterministic workspace review</p>
        <h2>${activeRoles} ${pluralize(activeRoles, 'companion')} ${activeRoles === 1 ? 'has' : 'have'} something useful to add.</h2>
        <p>${suggestions} ${pluralize(suggestions, 'suggestion')} currently come from editor and Git evidence. The real Codex response is not connected to the Council until the next slice.</p>
      </section>
      ${renderContext(turn)}
      ${renderWarnings(turn.capture.warnings)}
      <section class="roles">${renderRoles(review, false)}</section>
      ${renderCouncilComposer()}
    </main>`;
}

function renderEmptyCouncil(
  turn: CouncilTurn,
  review: CouncilReview,
  runtime: CodexRuntimeStatus
): string {
  return `
    <main>
      <p class="eyebrow">Council waiting</p>
      <section class="empty-state">
        <h1>No project context yet</h1>
        <p>Open a folder so the Council can inspect bounded editor and Git evidence.</p>
        <div class="button-row">
          <button class="action" id="open-folder" type="button">Open folder</button>
          <button class="action secondary" id="refresh-context" type="button">Refresh context</button>
        </div>
        <small>Captured locally at ${escapeHtml(formatCapturedAt(turn.capture.capturedAt))}.</small>
      </section>
      ${renderRuntime(runtime)}
      ${renderCodexConversation(runtime)}
      <section class="roles">${renderRoles(review, true)}</section>
    </main>`;
}

function renderRuntime(runtime: CodexRuntimeStatus): string {
  const thread = runtime.thread.thread;
  const details = [
    `Binary: ${runtime.binary}`,
    runtime.server?.userAgent,
    thread ? `Thread ${shortId(thread.id)}` : undefined,
    thread?.model,
    thread?.modelProvider
  ].filter((value): value is string => Boolean(value)).join(' · ');
  return `
    <section class="runtime runtime--${runtime.phase}">
      <div>
        <p class="eyebrow">Codex runtime</p>
        <h2>${escapeHtml(runtimeTitle(runtime))}</h2>
        <p>${escapeHtml(runtime.message)}</p>
        ${runtime.phase === 'ready' ? `<p class="strong">${escapeHtml(runtime.thread.message)}</p>` : ''}
        <small>${escapeHtml(details)}</small>
      </div>
      <div class="button-row">${runtimeActions(runtime)}</div>
    </section>`;
}

function runtimeActions(runtime: CodexRuntimeStatus): string {
  if (runtime.phase === 'connecting') {
    return '<button class="action" disabled>Connecting…</button>';
  }
  if (runtime.phase !== 'ready') {
    return `<button class="action" id="connect-codex">${runtime.phase === 'error' ? 'Retry connection' : 'Connect Codex'}</button>`;
  }
  const threadButton = runtime.thread.phase === 'starting'
    ? '<button class="action" disabled>Starting session…</button>'
    : `<button class="action" id="start-codex-thread">${runtime.thread.phase === 'ready' ? 'New Codex session' : 'Start Codex session'}</button>`;
  return `${threadButton}<button class="action secondary" id="disconnect-codex">Disconnect</button>`;
}

function runtimeTitle(runtime: CodexRuntimeStatus): string {
  if (runtime.phase === 'connecting') return 'Connecting to app-server';
  if (runtime.phase === 'error') return 'Connection failed';
  if (runtime.phase === 'disconnected') return 'Not connected';
  return runtime.thread.phase === 'ready' ? 'Thread ready' : 'Handshake complete';
}

function renderCodexConversation(runtime: CodexRuntimeStatus): string {
  if (runtime.phase !== 'ready' || runtime.thread.phase !== 'ready') {
    return '';
  }
  const running = runtime.turn.phase === 'starting' || runtime.turn.phase === 'streaming';
  const transcript = runtime.turn.userMessage
    ? `<div class="transcript">
        <article class="message message--user"><span>You</span><p>${escapeHtml(runtime.turn.userMessage)}</p></article>
        <article class="message message--assistant"><span>Codex</span><p>${escapeHtml(runtime.turn.assistantMessage || (running ? '…' : 'No assistant message was returned.'))}</p></article>
      </div>`
    : '<p class="muted">The thread is ready. Send the first explicit prompt when you choose.</p>';
  return `
    <section class="codex-chat">
      <div class="section-heading">
        <div><p class="eyebrow">Primary assistant</p><h2>Codex conversation</h2></div>
        <span class="phase">${escapeHtml(runtime.turn.phase)}</span>
      </div>
      ${transcript}
      <label for="codex-composer">Message Codex</label>
      <textarea id="codex-composer" ${running ? 'disabled' : ''} placeholder="Ask Codex about the current project…"></textarea>
      <div class="composer-footer">
        <small id="codex-status">${escapeHtml(runtime.turn.message)}</small>
        <button class="action" id="send-codex-turn" ${running ? 'disabled' : ''}>${running ? 'Codex is responding…' : 'Send to Codex'}</button>
      </div>
      <small>Sending starts a real model turn. It never happens automatically.</small>
    </section>`;
}

function renderContext(turn: CouncilTurn): string {
  const pills = [
    turn.workspace.name,
    turn.workspace.activeFile,
    turn.workspace.selectedText ? `Selection: ${turn.workspace.selectedText.length} chars` : undefined,
    turn.git?.branch,
    turn.git?.changedFiles.length ? `${turn.git.changedFiles.length} changed files` : undefined,
    `Captured ${formatCapturedAt(turn.capture.capturedAt)}`
  ].filter((value): value is string => Boolean(value));
  return `<div class="pills">${pills.map((pill) => `<span>${escapeHtml(pill)}</span>`).join('')}</div>`;
}

function renderWarnings(warnings: readonly string[]): string {
  return warnings.length
    ? `<details class="warnings"><summary>${warnings.length} context warnings</summary><ul>${warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join('')}</ul></details>`
    : '';
}

function renderRoles(review: CouncilReview, empty: boolean): string {
  const definitions = new Map(COUNCIL_ROLES.map((role) => [role.id, role]));
  return review.roles.map((roleReview) => {
    const role = definitions.get(roleReview.role);
    if (!role) throw new Error(`Missing role ${roleReview.role}`);
    return empty ? renderEmptyRole(roleReview, role) : renderRole(roleReview, role);
  }).join('');
}

function renderRole(review: CouncilRoleReview, role: CouncilRoleDefinition): string {
  const count = review.suggestions.length;
  const content = count
    ? review.suggestions.map((suggestion) => renderSuggestion(suggestion, role)).join('')
    : '<p class="muted">This companion found no useful addition.</p>';
  return roleShell(role, count ? `${count} ${pluralize(count, 'suggestion')}` : 'Nothing to add', content, count === 0);
}

function renderEmptyRole(review: CouncilRoleReview, role: CouncilRoleDefinition): string {
  return roleShell(role, EMPTY_ROLE_STATUS[review.role], '<p class="muted">No concrete project signal is available yet.</p>', true);
}

function roleShell(role: CouncilRoleDefinition, status: string, content: string, silent: boolean): string {
  return `<article class="role${silent ? ' silent' : ''}"><div class="icon">${role.icon}</div><div><div class="role-title"><h3>${escapeHtml(role.name)}</h3><span>${escapeHtml(status)}</span></div><p class="muted">${escapeHtml(role.purpose)}</p><div class="suggestions">${content}</div></div></article>`;
}

function renderSuggestion(suggestion: CouncilSuggestion, role: CouncilRoleDefinition): string {
  return `<article class="suggestion"><h4>${escapeHtml(suggestion.title)}</h4><p>${escapeHtml(suggestion.rationale)}</p><button class="action" data-role="${escapeHtml(role.name)}" data-prompt="${escapeHtml(suggestion.prompt)}">${escapeHtml(suggestion.actionLabel)}</button></article>`;
}

function renderCouncilComposer(): string {
  return `<section class="council-composer"><label for="council-composer">Prepared Council prompt</label><textarea id="council-composer" placeholder="Choose a Council suggestion…"></textarea><div class="composer-footer"><small id="composer-status">No suggestion selected.</small><div class="button-row"><button class="action secondary" id="clear-prompt">Clear</button><button class="action" id="copy-prompt">Copy prompt</button></div></div></section>`;
}

function renderDocument(body: string, nonce: string, script: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${escapeHtml(nonce)}';"><title>Pets Council</title><style>${styles()}</style></head><body>${body}<script nonce="${escapeHtml(nonce)}">${script}</script></body></html>`;
}

function styles(): string {
  return `:root{color-scheme:light dark;font-family:var(--vscode-font-family)}*{box-sizing:border-box}body{margin:0;padding:24px;color:var(--vscode-foreground);background:var(--vscode-editor-background)}main{width:min(960px,100%);margin:auto}h1,h2,h3,h4,p{margin-top:0}.header-row,.section-heading,.runtime,.composer-footer,.role-title{display:flex;justify-content:space-between;align-items:flex-start;gap:16px}.eyebrow{margin:0 0 6px;color:var(--vscode-descriptionForeground);font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase}.action{padding:7px 11px;border:1px solid transparent;border-radius:6px;color:var(--vscode-button-foreground);background:var(--vscode-button-background);cursor:pointer}.secondary{color:var(--vscode-foreground);background:transparent;border-color:var(--vscode-panel-border)}button:disabled{opacity:.6;cursor:wait}.button-row{display:flex;gap:8px;flex-wrap:wrap}.runtime,.codex-chat,.empty-state,.council-intro,.council-composer{margin:16px 0;padding:18px;border:1px solid var(--vscode-panel-border);border-radius:14px;background:var(--vscode-sideBar-background)}.runtime--ready{border-color:var(--vscode-testing-iconPassed,var(--vscode-focusBorder))}.runtime--error{border-color:var(--vscode-inputValidation-errorBorder,var(--vscode-errorForeground))}.strong{color:var(--vscode-foreground)}small,.muted{color:var(--vscode-descriptionForeground);line-height:1.45}.runtime__actions{justify-content:flex-end}.phase,.role-title span{color:var(--vscode-descriptionForeground);font-size:11px;font-weight:700;text-transform:uppercase}.transcript{display:grid;gap:10px;margin:14px 0}.message{padding:12px;border:1px solid var(--vscode-panel-border);border-radius:10px}.message span{font-size:11px;font-weight:700;text-transform:uppercase}.message p{margin:6px 0 0;white-space:pre-wrap}.message--assistant{background:var(--vscode-editor-background)}textarea{width:100%;min-height:96px;margin-top:8px;padding:11px;border:1px solid var(--vscode-input-border,var(--vscode-panel-border));border-radius:8px;color:var(--vscode-input-foreground);background:var(--vscode-input-background);font:inherit}.composer-footer{align-items:center;margin-top:10px}.pills{display:flex;gap:8px;flex-wrap:wrap;margin:16px 0}.pills span{padding:5px 9px;border:1px solid var(--vscode-panel-border);border-radius:999px;color:var(--vscode-descriptionForeground);font-size:11px}.warnings{margin:16px 0}.roles{display:grid;gap:12px}.role{display:grid;grid-template-columns:auto 1fr;gap:14px;padding:16px;border:1px solid var(--vscode-panel-border);border-radius:13px;background:var(--vscode-sideBar-background)}.silent{opacity:.72}.icon{font-size:24px}.suggestions{display:grid;gap:9px}.suggestion{padding:12px;border:1px solid var(--vscode-panel-border);border-radius:9px;background:var(--vscode-editor-background)}.suggestion p{color:var(--vscode-descriptionForeground)}@media(max-width:640px){body{padding:14px}.header-row,.section-heading,.runtime,.composer-footer{display:block}.button-row,.runtime__actions{margin-top:10px}.role{grid-template-columns:1fr}}`;
}

function renderRuntimeScript(): string {
  return `for(const [id,type] of [['connect-codex','connectCodex'],['disconnect-codex','disconnectCodex'],['start-codex-thread','startCodexThread']]){const element=document.getElementById(id);if(element)element.addEventListener('click',()=>vscode.postMessage({type}));}const send=document.getElementById('send-codex-turn');const codexComposer=document.getElementById('codex-composer');if(send&&codexComposer){const submit=()=>{const value=codexComposer.value.trim();if(value){send.disabled=true;vscode.postMessage({type:'startCodexTurn',value});}};send.addEventListener('click',submit);codexComposer.addEventListener('keydown',(event)=>{if((event.metaKey||event.ctrlKey)&&event.key==='Enter'){event.preventDefault();submit();}});}`;
}

function renderInteractiveScript(): string {
  return `const vscode=acquireVsCodeApi();${renderRuntimeScript()}const composer=document.getElementById('council-composer');const status=document.getElementById('composer-status');const state=vscode.getState();if(state?.draft)composer.value=state.draft;document.querySelectorAll('[data-prompt]').forEach(button=>button.addEventListener('click',()=>{composer.value=button.dataset.prompt||'';vscode.setState({draft:composer.value});status.textContent='Prepared from '+(button.dataset.role||'Council')+'.';}));composer.addEventListener('input',()=>vscode.setState({draft:composer.value}));document.getElementById('copy-prompt').addEventListener('click',()=>{const value=composer.value.trim();if(value)vscode.postMessage({type:'copyPrompt',value});});document.getElementById('clear-prompt').addEventListener('click',()=>{composer.value='';vscode.setState({draft:''});});document.getElementById('refresh-context').addEventListener('click',()=>vscode.postMessage({type:'refreshContext'}));`;
}

function renderEmptyScript(): string {
  return `const vscode=acquireVsCodeApi();${renderRuntimeScript()}document.getElementById('open-folder')?.addEventListener('click',()=>vscode.postMessage({type:'openFolder'}));document.getElementById('refresh-context')?.addEventListener('click',()=>vscode.postMessage({type:'refreshContext'}));`;
}

export function formatCapturedAt(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(undefined,{hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(date);
}

function shortId(value: string): string { return value.length <= 12 ? value : `${value.slice(0,8)}…${value.slice(-4)}`; }
function pluralize(count: number, singular: string): string { return count === 1 ? singular : `${singular}s`; }
function escapeHtml(value: string): string { return value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;'); }

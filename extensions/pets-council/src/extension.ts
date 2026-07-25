import * as vscode from 'vscode';

type CouncilRole = Readonly<{
  id: 'architect' | 'guardian' | 'strategist' | 'notetaker';
  icon: string;
  name: string;
  purpose: string;
  question: string;
}>;

const COUNCIL_ROLES: readonly CouncilRole[] = [
  {
    id: 'architect',
    icon: '🏗️',
    name: 'Architect',
    purpose: 'Turns the current goal into the next coherent implementation slice.',
    question: 'What should we build next?'
  },
  {
    id: 'guardian',
    icon: '🛡️',
    name: 'Guardian',
    purpose: 'Surfaces risks, defects, assumptions, and missing tests.',
    question: 'What could break or be misunderstood?'
  },
  {
    id: 'strategist',
    icon: '🧭',
    name: 'Strategist',
    purpose: 'Clarifies priorities, sequencing, scope, and trade-offs.',
    question: 'What is the smartest order of operations?'
  },
  {
    id: 'notetaker',
    icon: '📚',
    name: 'Notetaker',
    purpose: 'Preserves decisions, context, and project memory.',
    question: 'What must not be forgotten?'
  }
];

export function activate(context: vscode.ExtensionContext): void {
  const openCouncil = vscode.commands.registerCommand(
    'petsCouncil.openCouncil',
    () => showCouncilPanel(context.extensionUri)
  );

  context.subscriptions.push(openCouncil);
}

export function deactivate(): void {
  // No long-lived resources yet.
}

function showCouncilPanel(extensionUri: vscode.Uri): void {
  const panel = vscode.window.createWebviewPanel(
    'petsCouncil.panel',
    'Pets Council',
    vscode.ViewColumn.Beside,
    {
      enableScripts: false,
      localResourceRoots: [extensionUri],
      retainContextWhenHidden: true
    }
  );

  panel.webview.html = renderCouncilHtml();
}

function renderCouncilHtml(): string {
  const roleCards = COUNCIL_ROLES.map(
    (role) => `
      <article class="role role--${role.id}">
        <div class="role__icon" aria-hidden="true">${role.icon}</div>
        <div>
          <p class="role__name">${role.name}</p>
          <p class="role__purpose">${role.purpose}</p>
          <p class="role__question">${role.question}</p>
        </div>
      </article>`
  ).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
  <title>Pets Council</title>
  <style>
    :root {
      color-scheme: light dark;
      font-family: var(--vscode-font-family);
    }

    body {
      margin: 0;
      padding: 24px;
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
    }

    main {
      width: min(760px, 100%);
      margin: 0 auto;
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
      margin: 0;
      font-size: clamp(28px, 5vw, 48px);
      line-height: 1;
    }

    .promise {
      margin: 16px 0 28px;
      color: var(--vscode-descriptionForeground);
      font-size: 16px;
      line-height: 1.6;
    }

    .roles {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 12px;
    }

    .role {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 14px;
      min-height: 132px;
      padding: 18px;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 14px;
      background: var(--vscode-sideBar-background);
    }

    .role__icon {
      display: grid;
      place-items: center;
      width: 42px;
      height: 42px;
      border-radius: 12px;
      background: var(--vscode-badge-background);
      font-size: 22px;
    }

    .role__name {
      margin: 2px 0 8px;
      font-size: 17px;
      font-weight: 700;
    }

    .role__purpose,
    .role__question {
      margin: 0;
      line-height: 1.45;
    }

    .role__purpose {
      color: var(--vscode-descriptionForeground);
    }

    .role__question {
      margin-top: 12px;
      font-weight: 600;
    }

    footer {
      margin-top: 22px;
      padding: 14px 16px;
      border-left: 3px solid var(--vscode-focusBorder);
      color: var(--vscode-descriptionForeground);
      background: var(--vscode-textBlockQuote-background);
    }
  </style>
</head>
<body>
  <main>
    <p class="eyebrow">First vertical slice</p>
    <h1>Meet the Council</h1>
    <p class="promise">
      One assistant answers. Four companions review the same turn from different angles.
      Nothing runs automatically: the user chooses what happens next.
    </p>
    <section class="roles" aria-label="Council roles">
      ${roleCards}
    </section>
    <footer>
      Next milestone: connect this panel to a shared turn context and return zero to two actionable suggestions per role.
    </footer>
  </main>
</body>
</html>`;
}

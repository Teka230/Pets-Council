# Architecture

## Product loop

```text
User message
    ↓
Primary assistant response
    ↓
Shared turn context
    ├── conversation
    ├── active editor and explicit selection
    ├── Git status and diff statistics
    ├── roadmap and notes
    └── runtime events
    ↓
Council review
    ├── Architect
    ├── Guardian
    ├── Strategist
    └── Notetaker
    ↓
0–2 suggestions per role
    ↓
Explicit user choice
```

The council is consultative. A suggestion may prepare text for the composer, open relevant context, or explain a risk, but it must not silently modify the workspace.

## Technical layers

### 1. Code - OSS distribution

Code - OSS provides the editor, workbench, terminal, source control, search, workspaces, extension host, accessibility foundations, and platform packaging.

The upstream revision is pinned in `config/upstream.json`. The source is fetched into `.vendor/vscode` and is never committed to this repository.

### 2. Integrated Pets Council extension

The integrated extension owns most product behavior:

- council roles and prompts;
- shared turn context;
- Codex runtime adapter;
- suggestions and explicit acceptance;
- project notes and decision memory;
- user-facing panels and commands;
- pet packages and role assignments.

This layer should remain usable as a normal VS Code-compatible extension whenever possible.

### 3. Native workbench patches

Native patches are reserved for experiences that cannot be implemented cleanly through supported extension APIs:

- pets moving across editor, terminal, and sidebar surfaces;
- a global overlay layer;
- native activity and permission events unavailable to extensions;
- a deeply integrated agent composer.

Every native patch must have:

1. a clear product reason;
2. a narrow surface area;
3. an upstream file list;
4. an automated regression check;
5. a documented rebase strategy.

## Current extension boundary

The extension exposes one command:

```text
Pets Council: Open Council
```

It opens an interactive panel backed by a deterministic mock provider and a live local context collector. The current slice includes:

- typed `CouncilTurn`, `CouncilSuggestion`, `CouncilRoleReview`, and `CouncilReview` contracts;
- live workspace and active-editor metadata;
- explicit editor selection capture;
- bounded read-only Git inspection;
- all four roles in a stable order;
- zero to two suggestions per role;
- intentionally silent roles;
- a local composer filled only after a suggestion click;
- an explicit copy action through the extension host;
- an explicit context refresh action.

There is still no model call, filesystem write, project indexing, autonomous action, or Codex dependency.

## Context collector

`workspaceContext.ts` creates the live `CouncilTurn`.

### Workspace input

The collector reads:

- `vscode.workspace.name`;
- the active editor URI;
- a workspace-relative active file path where possible;
- the current editor selection only when it is non-empty.

It does not scan the active file or repository contents. Selected text is capped at 2,000 characters and the truncation is visible in `CouncilCapture.warnings`.

### Git input

The collector runs time-limited, read-only Git commands in the active workspace folder:

```text
git rev-parse --show-toplevel
git branch --show-current
git rev-parse --short HEAD
git status --porcelain=v1 -z --untracked-files=all
git diff --stat=80,20 --compact-summary
git diff --cached --stat=80,20 --compact-summary
```

The resulting context is bounded:

- maximum 50 changed file paths;
- maximum 2,000 characters of combined staged and unstaged diff statistics;
- no absolute repository root is included in the council UI;
- failures become visible warnings and do not block the panel.

The Git commands inspect repository state but do not modify it.

## Turn contract

The model-independent contract is implemented in `extensions/pets-council/src/domain.ts`:

```ts
type CouncilTurn = {
  turnId: string;
  userMessage: string;
  assistantResponse: string;
  capture: {
    mode: 'live' | 'sample';
    capturedAt: string;
    warnings: readonly string[];
  };
  workspace: {
    name?: string;
    activeFile?: string;
    selectedText?: string;
    selectedTextTruncated?: boolean;
  };
  git?: {
    branch?: string;
    changedFiles: readonly string[];
    changedFilesTruncated?: boolean;
    diffSummary?: string;
    diffSummaryTruncated?: boolean;
  };
};

type CouncilSuggestion = {
  id: string;
  role: 'architect' | 'guardian' | 'strategist' | 'notetaker';
  title: string;
  rationale: string;
  prompt: string;
  actionLabel: string;
};
```

The mock provider is deterministic for the same turn. The UI renders zero suggestions without treating that as an error. Silence is a valid council response when a role has nothing useful to add.

## Webview trust boundary

The webview owns local prompt preparation and editing. Its extension-host messages are:

```ts
{ type: 'copyPrompt', value: string }
{ type: 'refreshContext' }
```

The extension validates both messages. `refreshContext` performs the same bounded local read again. `copyPrompt` writes only to the clipboard. Neither message executes the prepared prompt or writes to the workspace.

## Security and trust

- No suggestion executes automatically.
- Workspace writes require an explicit user action.
- Only an explicit editor selection contributes file text to this slice.
- Git inspection is read-only, bounded, and time-limited.
- Capture truncation and unavailable context remain visible.
- Runtime permissions remain visible.
- Prompt and model configuration stay separate from visual pet assets.
- A pet skin must never implicitly grant capabilities.

The core invariant is:

```text
visual pet ≠ council role ≠ prompt ≠ model ≠ permission
```

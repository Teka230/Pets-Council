# Architecture

## Product loop

```text
User message
    ↓
Primary assistant response
    ↓
Shared turn context
    ├── conversation
    ├── active files and selection
    ├── Git state and diff
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

## Initial extension boundary

The first extension exposes one command:

```text
Pets Council: Open Council
```

It opens a panel presenting the four roles. There is no model call, filesystem write, project indexing, autonomous action, or Codex dependency in this first slice.

## Proposed turn contract

The next slice should introduce a model-independent contract similar to:

```ts
type CouncilTurn = {
  turnId: string;
  userMessage: string;
  assistantResponse: string;
  workspace: {
    name?: string;
    activeFile?: string;
    selectedText?: string;
  };
  git?: {
    branch?: string;
    changedFiles: string[];
    diffSummary?: string;
  };
};

type CouncilSuggestion = {
  role: 'architect' | 'guardian' | 'strategist' | 'notetaker';
  title: string;
  rationale: string;
  prompt?: string;
};
```

The UI must render zero suggestions without treating that as an error. Silence is a valid council response when a role has nothing useful to add.

## Security and trust

- No suggestion executes automatically.
- Workspace writes require an explicit user action.
- Runtime permissions remain visible.
- Prompt and model configuration stay separate from visual pet assets.
- A pet skin must never implicitly grant capabilities.

The core invariant is:

```text
visual pet ≠ council role ≠ prompt ≠ model ≠ permission
```

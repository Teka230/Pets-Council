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
Evidence gate
    ├── concrete signal found → Council review
    └── no concrete signal → quiet onboarding state
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
- the useful-evidence gate;
- the typed Codex runtime adapter;
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

It opens an interactive panel backed by a deterministic mock provider, a live local context collector, and an explicit Codex runtime connection. The current slice includes:

- typed Council and runtime contracts;
- live workspace and active-editor metadata;
- explicit editor selection capture;
- bounded read-only Git inspection;
- a pure useful-evidence gate;
- all four roles in a stable order;
- zero to two suggestions per role;
- a dedicated empty state when no evidence exists;
- an explicit folder picker and context refresh action;
- a local composer shown only when suggestions exist;
- an explicit copy action through the extension host;
- a user-triggered `codex app-server` process;
- the required `initialize` then `initialized` handshake;
- visible disconnected, connecting, ready, and error states.

There is still no thread creation, model turn, approval handling, filesystem write, project indexing, or autonomous action.

## Evidence gate

`evidence.ts` separates captured metadata from context that is useful enough to justify a Council response.

For a live capture, useful evidence means at least one of:

```text
active file
explicit editor selection
Git branch
changed files
Git diff summary
```

The placeholder `userMessage` and `assistantResponse` used before Codex integration are deliberately ignored in live mode. They remain valid evidence only for deterministic sample turns.

If no useful evidence exists:

- every role returns an empty suggestion list;
- the UI does not claim that companions have useful advice;
- the prompt composer is hidden;
- the panel shows **Open folder** and **Refresh context**;
- role statuses explain what each companion is waiting for.

This makes silence a product behavior, not merely an allowed provider response.

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

## Codex runtime adapter

The runtime is split into four testable layers:

```text
runtime/jsonl.ts
    newline-delimited JSON framing
        ↓
runtime/stdioTransport.ts
    codex app-server process and stdio
        ↓
runtime/client.ts
    requests, responses, notifications, initialize handshake
        ↓
runtime/service.ts
    explicit lifecycle and UI-facing status
```

### Process boundary

The process is started only after the user presses **Connect Codex**:

```text
codex app-server --listen stdio://
```

Binary resolution order:

```text
petsCouncil.codexBinary
        ↓
CODEX_BIN
        ↓
codex on PATH
```

Changing the configured binary disconnects the current process. Reconnection is not automatic.

### Protocol boundary

The client completes exactly this handshake:

```text
initialize request
        ↓
initialize response
        ↓
initialized notification
        ↓
ready
```

The client does not opt into experimental API capabilities in this slice.

`ready` means the transport and initialization succeeded. It does not mean a thread exists, a model is running, or permissions have been granted.

### Runtime states

```text
disconnected
     ↓ explicit Connect
connecting
     ├── success → ready
     └── failure → error
ready
     ├── explicit Disconnect → disconnected
     └── unexpected exit → error
error
     ↓ explicit Retry
connecting
```

The runtime service is shared by Council panels, while each panel keeps its own captured context and draft.

See `docs/codex-runtime.md` for detailed lifecycle and test coverage.

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
```

The mock provider is deterministic for the same turn. The UI renders zero suggestions without treating that as an error.

## Webview trust boundary

The webview owns local prompt preparation and editing. Its extension-host messages are:

```ts
{ type: 'copyPrompt', value: string }
{ type: 'refreshContext' }
{ type: 'openFolder' }
{ type: 'connectCodex' }
{ type: 'disconnectCodex' }
```

The extension validates all messages.

- `refreshContext` performs the same bounded local read again.
- `copyPrompt` writes only to the clipboard.
- `openFolder` opens a native folder picker, then asks VS Code to open the explicitly selected folder.
- `connectCodex` starts and initializes app-server but creates no thread.
- `disconnectCodex` stops the shared app-server process.

No message executes a prepared prompt or writes project files.

## Security and trust

- No suggestion executes automatically.
- Workspace writes require an explicit user action.
- Only an explicit editor selection contributes file text to this slice.
- Git inspection is read-only, bounded, and time-limited.
- No evidence means no generated advice.
- Codex does not connect automatically.
- A ready runtime has not created a thread or sent a prompt.
- Stderr diagnostics are bounded.
- Prompt and model configuration stay separate from visual pet assets.
- A pet skin must never implicitly grant capabilities.

The core invariant is:

```text
visual pet ≠ council role ≠ prompt ≠ model ≠ permission
```

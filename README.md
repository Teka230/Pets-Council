# Pets Council

**A playful Code - OSS experiment where specialized companions review your work and help you choose the next step.**

> Codex answers. The council reviews. You decide.

Pets Council explores a different shape for an AI coding workspace: one primary assistant produces the answer, then a small council examines the same turn from complementary perspectives.

- **Architect** — proposes the next implementation slice
- **Guardian** — surfaces risks, defects, and missing tests
- **Strategist** — structures priorities and trade-offs
- **Notetaker** — preserves decisions and project memory

The companions do not execute actions autonomously. Their suggestions remain visible, optional, and explicitly chosen by the user.

## What this repository is

This repository starts as a lightweight distribution layer around [Code - OSS](https://github.com/microsoft/vscode), rather than a permanently divergent source dump.

It contains:

- a reproducible upstream pin;
- scripts that fetch the matching Code - OSS revision;
- a built-in Pets Council extension;
- typed council, context, evidence, and runtime contracts;
- deterministic council behavior for development;
- an explicit `codex app-server` stdio handshake;
- architecture and roadmap documentation;
- CI for type-checking, tests, and the extension build.

Keeping the product logic inside an integrated extension lets the project move quickly while reserving direct workbench patches for features that truly require them, such as pets moving across native editor surfaces.

## Current status

Run **Pets Council: Open Council** to open the live workspace review.

The panel currently:

- captures the workspace name and active editor path;
- includes editor text only when the user explicitly selected it;
- runs bounded, read-only Git inspection;
- requires concrete editor or Git evidence before producing suggestions;
- keeps all four companions silent when no useful evidence exists;
- shows an onboarding state with **Open folder** and **Refresh context** actions;
- returns zero to two deterministic suggestions per role;
- lets the user prepare, edit, and copy a suggested prompt;
- displays the Codex runtime as a separate explicit capability;
- starts `codex app-server` only after **Connect Codex** is pressed;
- completes the required `initialize` then `initialized` handshake;
- exposes disconnected, connecting, ready, and error states;
- supports explicit disconnect and retry;
- never creates a Codex thread or sends a prompt in this slice.

The council provider and conversation content are still model-independent placeholders. Real threads, turns, streaming events, approvals, animated pets, and workbench overlays are not implemented yet.

## Codex runtime boundary

The runtime connection is intentionally narrower than a chat integration:

```text
Connect Codex
      ↓
spawn codex app-server --listen stdio://
      ↓
JSONL initialize request
      ↓
initialize response
      ↓
initialized notification
      ↓
Ready — no thread and no turn yet
```

The binary is resolved in this order:

1. `petsCouncil.codexBinary` setting;
2. `CODEX_BIN` environment variable;
3. `codex` on `PATH`.

See [`docs/codex-runtime.md`](docs/codex-runtime.md) for the protocol and lifecycle boundary.

## Evidence gate

A live capture does not count placeholder conversation copy as evidence. The Council only speaks when at least one concrete signal exists:

```text
active file
    or
explicit editor selection
    or
Git branch
    or
changed files / diff statistics
        ↓
Council review
```

Without one of those signals, the panel becomes an onboarding surface rather than inventing generic advice.

## Context boundary

This slice intentionally avoids repository indexing and broad file-content collection.

```text
VS Code workspace metadata
        +
active file path
        +
explicit editor selection (max 2,000 chars)
        +
read-only Git status and diff stats
        ↓
bounded CouncilTurn
```

Absolute workspace paths are not displayed in the council UI. Git commands are read-only and time-limited. Missing Git or editor context becomes visible onboarding or a warning rather than fabricated advice.

## Quick start

Requirements:

- Node.js 22 or newer
- Git
- npm
- Codex CLI installed and authenticated to test the runtime connection

```bash
npm install
npm run check
npm run typecheck
npm test
npm run build
npm run bootstrap
```

The bootstrap command clones the pinned Code - OSS revision into `.vendor/vscode` and copies the built-in extension source into its `extensions/pets-council` directory.

To refresh the copied extension after editing it:

```bash
npm run sync:extension
```

## Repository layout

```text
config/upstream.json                               pinned Code - OSS revision
docs/architecture.md                               product and technical boundaries
docs/codex-runtime.md                              app-server transport and handshake
docs/roadmap.md                                    incremental implementation path
extensions/pets-council/src/context.ts              bounded pure context helpers
extensions/pets-council/src/domain.ts               council contracts
extensions/pets-council/src/evidence.ts             useful-context evidence gate
extensions/pets-council/src/mockCouncil.ts          deterministic council provider
extensions/pets-council/src/runtime/client.ts       typed app-server client
extensions/pets-council/src/runtime/jsonl.ts        newline-delimited JSON framing
extensions/pets-council/src/runtime/service.ts      shared explicit runtime lifecycle
extensions/pets-council/src/runtime/stdioTransport.ts Codex process transport
extensions/pets-council/src/workspaceContext.ts     VS Code and read-only Git capture
extensions/pets-council/src/webview.ts              onboarding, runtime, review, composer
scripts/bootstrap-code-oss.mjs                     reproducible upstream checkout
scripts/check-environment.mjs                      local prerequisites check
scripts/sync-extension.mjs                         extension copy into Code - OSS
```

## Guiding architecture

```text
Code - OSS workbench
        |
        +-- Pets Council integrated extension
        |      +-- council UI
        |      +-- bounded project context
        |      +-- evidence gate
        |      +-- typed Codex runtime adapter
        |      +-- role prompts
        |
        +-- minimal native patches
               +-- pet overlay layer
               +-- workbench event bridge
```

The rule is simple:

> Extension first. Native patch only when the extension API cannot express the product experience.

## Upstream

The initial pin targets Code - OSS `1.131.0` at commit `dd862885ff5fbd279747c793e18105e6b7ddc805`, recorded on July 25, 2026.

## License

Pets Council is released under the MIT License. Code - OSS remains governed by its own MIT license and upstream notices.

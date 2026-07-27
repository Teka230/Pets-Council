# Pets Council

**An open Code - OSS distribution where Codex answers, a living council reviews the same turn, and the user decides what happens next.**

> Codex answers. Your companions review. You decide.

Four consultative companions receive a bounded projection of the same durable project context:

- **Architect** — proposes the next independently reviewable implementation slice;
- **Guardian** — identifies risks, regressions, unsafe assumptions, and missing tests;
- **Strategist** — clarifies order, scope, and trade-offs;
- **Greffier** — preserves decisions, provenance, proposals, and open questions.

They never send a prompt, accept a permission, run a command, or write a project file without a separate explicit action.

## Product loop

```text
User message
    ↓
Primary Codex turn streamed in the workspace
    ↓
Completed turn + editor + Git + roadmap + Fil Rouge + Shared Context Graph
    ↓
One structured, read-only Council review
    ├── Architect     0–2 suggestions
    ├── Guardian      0–2 suggestions
    ├── Strategist    0–2 suggestions
    └── Greffier      0–2 suggestions
    ↓
Explicit user choice
    ├── Use in Codex composer
    ├── Save to Shared Context Graph
    ├── Copy
    ├── Snooze
    └── Dismiss
```

A suggestion only fills the real Codex composer. The user can edit it before pressing **Send to Codex**.

## Capabilities

- explicit `codex app-server` connection, threads, resume, streaming, approvals, and interruption;
- completed-turn bridge into a shared `CouncilTurn`;
- one ephemeral, read-only, no-approval structured Council review;
- deterministic fallback when intelligent review is unavailable;
- bounded editor, Git, roadmap, and Fil Rouge ingestion;
- local Shared Context Graph with nodes, relations, actors, and provenance;
- explicit saving of accepted Council proposals;
- Pet Pack manifests and animated companion states;
- optional native Code - OSS overlay with reduced-motion support.

## Shared Context Graph

Durable context belongs to the graph, not to a chat or model. Storage is:

```text
.filrouge/council/shared-context-graph.json
```

when `.filrouge/` exists, otherwise:

```text
.pets-council/shared-context-graph.json
```

Writes happen only after **Save to graph**. The projector also reads these optional bounded sources:

```text
docs/roadmap.md
.filrouge/roadmap.md
.filrouge/context.md
.filrouge/README.md
```

No broad repository-content scan is performed.

## Council intelligence

```text
primary thread
    normal user-selected permissions

Council review thread
    ephemeral: true
    sandbox: read-only
    approvalPolicy: never
    structured output schema
```

One structured request produces all four role arrays. Silence is valid. Invalid or timed-out output falls back to deterministic rules.

## Living companions

```text
Orbital → Architect
Mono    → Guardian
Sprout  → Strategist
Hibou   → Greffier
```

The assignment is configuration, not identity:

```text
visual pet ≠ council role ≠ prompt ≠ model ≠ permission
```

## Native Code - OSS overlay

`npm run bootstrap` checks out the pinned Code - OSS revision, syncs the extension, applies the narrow workbench contribution, and links it from `workbench.common.main.ts`.

```bash
npm run native:apply
npm run native:verify
npm run native:verify-source
```

The overlay receives only a visual snapshot and opens the Council panel when clicked. It receives no prompts, file contents, credentials, commands, or permissions.

## Quick start

Requirements: Node.js 22+, Git, npm, and an installed/authenticated Codex CLI for runtime testing.

```bash
npm install
npm run check
npm run typecheck
npm test
npm run build
npm run native:verify-source
npm run bootstrap
```

Then:

```bash
cd .vendor/vscode
npm install
npm run compile
./scripts/code
```

## Layout

```text
extensions/pets-council/src/council/   structured Council provider
extensions/pets-council/src/memory/    Shared Context Graph and projector
extensions/pets-council/src/pets/      Pet Packs, states, native bridge
extensions/pets-council/src/runtime/   app-server runtime
native/code-oss/                       workbench overlay contribution
scripts/                               bootstrap, apply, and verification
```

The distribution pins Code - OSS `1.131.0` at commit `dd862885ff5fbd279747c793e18105e6b7ddc805`.

## License

MIT. Code - OSS remains governed by its own MIT license and upstream notices.

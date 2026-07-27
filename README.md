# Pets Council

**An open Code - OSS distribution where Codex answers, a living council reviews the same turn, and the user decides what happens next.**

> Codex answers. Your companions review. You decide.

Four consultative companions receive bounded projections of the same durable project context:

- **Architect** — proposes the next independently reviewable implementation slice;
- **Guardian** — identifies risks, regressions, unsafe assumptions, permissions, and missing tests;
- **Strategist** — clarifies order, scope, and trade-offs;
- **Greffier** — preserves decisions, provenance, proposals, supersession, and open questions.

They never send a prompt, accept a permission, run a command, or write a project file without a separate explicit action.

## Product loop

```text
User message
    ↓
Primary Codex turn streamed in the workspace
    ↓
Completed turn + editor + Git + roadmap + Fil Rouge + Shared Context Graph
    ↓
Actor-specific projections
    ├── Codex
    ├── Architect
    ├── Guardian
    ├── Strategist
    └── Greffier
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
- local Shared Context Graph with nodes, relations, actors, provenance, open questions, and supersession;
- separate context projections for Codex and each companion role;
- explicit saving of accepted Council proposals;
- local inspectable accepted, dismissed, and snoozed usage signals;
- atlas-backed Pet Packs with strip v1 and Hatch runtime v2 validation;
- native Code - OSS companions anchored near editor, terminal, sidebar, and project memory;
- reduced-motion support and glyph fallback;
- reproducible full Code - OSS desktop compile and manual smoke workflow.

## Shared Context Graph

Durable context belongs to the graph, not to a chat or model. Storage is:

```text
.filrouge/council/shared-context-graph.json
```

when `.filrouge/` exists, otherwise:

```text
.pets-council/shared-context-graph.json
```

Writes happen only after an explicit graph action. The command palette exposes:

```text
Pets Council: Open Shared Context Graph
Pets Council: Query Shared Context Graph
Pets Council: Add Open Question
Pets Council: Resolve Open Question
Pets Council: Replace Active Decision
```

A replacement decision creates a `supersedes` relation. The previous node remains addressable for provenance but disappears from active projections. Resolving a question creates a decision and a `resolves` relation.

The projector also reads these optional bounded sources:

```text
docs/roadmap.md
.filrouge/roadmap.md
.filrouge/context.md
.filrouge/README.md
```

No broad repository-content scan is performed.

## Local suggestion signals

Explicit suggestion outcomes are written as bounded JSONL:

```text
.filrouge/council/usage-signals.jsonl
```

or:

```text
.pets-council/usage-signals.jsonl
```

Only the action, timestamp, turn id, suggestion id, role, title, and provider are recorded. There is no remote analytics upload and no personal identifier.

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

One structured request produces all four role arrays. Each role receives its own durable-context projection. Silence is valid. Invalid or timed-out output falls back to deterministic rules.

## Living companions

```text
Orbital → Architect  → editor anchor
Mono    → Guardian   → terminal anchor
Sprout  → Strategist → sidebar anchor
Hibou   → Greffier   → memory anchor
```

The assignment is configuration, not identity:

```text
visual pet ≠ council role ≠ prompt ≠ model ≠ permission
```

A Pet Pack may provide a simple strip atlas or a Hatch runtime v2 atlas. Hatch v2 is validated as 8×11 cells of 192×208. Invalid or absent art falls back to the manifest glyph.

## Native Code - OSS overlay

`npm run bootstrap` checks out the pinned Code - OSS revision, builds and syncs the integrated extension including `dist/`, applies the narrow workbench contribution, and links it from `workbench.common.main.ts`.

```bash
npm run native:apply
npm run native:verify
npm run native:verify-source
```

The overlay receives only visual state, sprite atlas metadata, role, anchor, and suggestion count. It receives no prompts, file contents, credentials, commands, or permissions.

## Quick start

Requirements: Node.js 22+, Git, npm, and an installed/authenticated Codex CLI for runtime testing.

```bash
npm install
npm run check
npm run typecheck
npm test
npm run build
npm run native:verify-source
```

Build the complete patched desktop workbench:

```bash
npm run bootstrap
npm run desktop:smoke
```

Launch the interactive desktop smoke scenario:

```bash
npm run desktop:launch
```

The heavyweight GitHub Actions workflow **Desktop smoke** can compile the patched Code - OSS workbench manually without slowing every normal pull request.

## Layout

```text
extensions/pets-council/src/council/   structured Council provider
extensions/pets-council/src/memory/    Shared Context Graph, actor projections, usage signals
extensions/pets-council/src/pets/      Pet Packs, atlas validation, states, native bridge
extensions/pets-council/src/runtime/   app-server runtime
native/code-oss/                       workbench overlay contribution
scripts/                               bootstrap, desktop smoke, apply, verification
```

The distribution pins Code - OSS `1.131.0` at commit `dd862885ff5fbd279747c793e18105e6b7ddc805`.

## License

MIT. Code - OSS remains governed by its own MIT license and upstream notices.

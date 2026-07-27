# Architecture

## Canonical model

```text
Shared Context Graph
        ↓ Context Projector
Context Slice
        ↓
Graph Actors
  ├── Human
  ├── Primary Codex thread
  ├── Council review runtime
  ├── Architect / Guardian / Strategist / Greffier
  └── tools
```

The chat is a view and interaction point. It is not the durable owner of context.

## Product loop

```text
User prompt
    ↓
Primary Codex thread
    ↓ streamed turn
Completed exchange
    + bounded editor / Git capture
    + roadmap / Fil Rouge sources
    + Shared Context Graph projection
    ↓
One structured Council review
    ↓
0–2 suggestions per role
    ↓
Explicit user action
```

## Layer 1 — Integrated extension

The extension owns:

- primary Codex runtime lifecycle;
- explicit threads, turns, interruption, and approvals;
- bounded context ingestion;
- Shared Context Graph storage and projection;
- deterministic and Codex-backed Council providers;
- suggestion actions;
- Pet Pack assignments and webview animation;
- the bridge to the optional native overlay.

## Layer 2 — Council provider boundary

```text
CouncilProvider
   ├── DeterministicCouncilProvider
   └── CodexCouncilProvider
          ↓
      ephemeral thread
      read-only sandbox
      approvalPolicy: never
      strict output schema
```

One request produces all four role arrays. Any role may return an empty array. Structured output is validated and capped at two suggestions per role. Failure selects the deterministic provider rather than fabricating intelligence.

## Layer 3 — Shared Context Graph

The local, inspectable graph supports addressable messages, files, code ranges, commands, results, hypotheses, decisions, questions, proposals, notes, and sources. Relations include `responds_to`, `derived_from`, `concerns`, `produced_by`, `supersedes`, `validates`, `contradicts`, and `accepted_as`.

Only explicit **Save to graph** actions write the graph. A saved proposal records user, Codex, Council, and human-decision provenance. The projector reads only the graph and known bounded project sources; it does not recursively index the repository.

## Layer 4 — Pet Pack and visual state

```text
Pet Pack manifest
    ├── visual pet definitions
    └── role assignments

Council + runtime state
    ↓
PetSnapshot[]
    ↓
webview roster and optional native overlay
```

Visual state never grants capabilities. The same pet can be assigned to a different role without changing prompts, models, or permissions.

## Layer 5 — Narrow native workbench patch

The native source lives under `native/code-oss/` and is copied into the pinned checkout. The patch adds one side-effect import to `src/vs/workbench/workbench.common.main.ts` and registers:

```text
petsCouncil.nativeOverlay.update
petsCouncil.nativeOverlay.hide
```

The overlay receives only role, pet identity, glyph, visual state, and suggestion count. Clicking a pet invokes `petsCouncil.openCouncil`. The patch has an idempotent application script, source verification, a narrow import anchor, and reduced-motion CSS.

## Trust boundary

- Codex never connects automatically.
- Starting or resuming a session is explicit.
- Sending and stopping a turn is explicit.
- Command and file-change approvals are explicit.
- Council review is read-only, ephemeral, and uses `approvalPolicy: never`.
- Suggestions never send themselves.
- Graph writes require **Save to graph**.
- Known roadmap and Fil Rouge sources are bounded.
- The native overlay receives no prompt or file content.
- `visual pet ≠ council role ≠ prompt ≠ model ≠ permission`.

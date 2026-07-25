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
- a deterministic council provider and typed turn contracts;
- architecture and roadmap documentation;
- CI for type-checking, tests, and the extension build.

Keeping the product logic inside an integrated extension lets the project move quickly while reserving direct workbench patches for features that truly require them, such as pets moving across native editor surfaces.

## Current status

Run **Pets Council: Open Council** to open the first interactive loop.

The panel currently:

- reviews one shared mock `CouncilTurn`;
- returns zero to two deterministic suggestions per role;
- demonstrates a silent Strategist when it has nothing useful to add;
- lets the user prepare and edit a suggested prompt locally;
- copies the prompt only after a second explicit action;
- never writes to the workspace or executes the prepared prompt.

This is still a model-independent demo. Codex connectivity, live project context, animated pets, and workbench overlays are not implemented yet.

## Quick start

Requirements:

- Node.js 22 or newer
- Git
- npm

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
config/upstream.json                         pinned Code - OSS revision
docs/architecture.md                         product and technical boundaries
docs/roadmap.md                              incremental implementation path
extensions/pets-council/src/domain.ts         turn, role, review, and suggestion contracts
extensions/pets-council/src/mockCouncil.ts    deterministic council provider
extensions/pets-council/src/webview.ts        interactive review and local composer
scripts/bootstrap-code-oss.mjs               reproducible upstream checkout
scripts/check-environment.mjs                local prerequisites check
scripts/sync-extension.mjs                   extension copy into Code - OSS
```

## Guiding architecture

```text
Code - OSS workbench
        |
        +-- Pets Council integrated extension
        |      +-- council UI
        |      +-- role prompts
        |      +-- project context
        |      +-- Codex runtime adapter
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

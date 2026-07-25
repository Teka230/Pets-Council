# Roadmap

## Milestone 0 — Distribution bootstrap

- [x] Initialize the public repository
- [x] Pin a Code - OSS upstream revision
- [x] Add a reproducible bootstrap script
- [x] Add a built-in extension workspace
- [x] Open a first council panel
- [x] Add CI and architecture documentation

## Milestone 1 — Shared council context

- [x] Define `CouncilTurn` and `CouncilSuggestion` contracts
- [ ] Capture the active editor, selection, workspace, and Git summary
- [x] Add a mock council provider for deterministic development
- [x] Render zero to two suggestions per role
- [x] Add unit tests for role limits and empty responses

## Milestone 2 — Codex runtime adapter

- [ ] Connect to `codex app-server`
- [ ] Map threads, turns, streaming events, and approvals
- [ ] Keep the runtime behind a typed adapter
- [ ] Show connection and permission state in the UI
- [ ] Add failure and reconnection scenarios

## Milestone 3 — Actionable suggestions

- [x] Insert a selected suggestion into a local composer
- [x] Preserve the originating role and rationale in the review
- [ ] Add dismiss, snooze, and save-to-notes actions
- [x] Prevent automatic execution
- [ ] Measure whether suggestions are used or ignored locally

## Milestone 4 — Project memory

- [ ] Add project-scoped notes
- [ ] Track accepted decisions
- [ ] Import roadmap and Fil Rouge context when available
- [ ] Build compact context summaries
- [ ] Keep storage local and inspectable

## Milestone 5 — Living companions

- [ ] Define the Pet Pack manifest
- [ ] Separate visual pets from council roles
- [ ] Add idle, attention, thinking, and suggestion states
- [ ] Prototype pets inside supported webview surfaces
- [ ] Validate accessibility and reduced-motion behavior

## Milestone 6 — Minimal native layer

- [ ] Prototype a global pet overlay in the Code - OSS workbench
- [ ] Bridge selected native events to the integrated extension
- [ ] Document every upstream patch
- [ ] Add patch application and verification scripts
- [ ] Test rebasing onto the next Code - OSS release

## Not planned for the early project

- autonomous multi-agent delegation;
- silent workspace modification;
- a proprietary extension marketplace;
- a large permanent divergence from Code - OSS;
- bundling private credentials or model access.

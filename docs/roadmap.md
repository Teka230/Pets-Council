# Roadmap

## Milestone 0 — Distribution bootstrap

- [x] Initialize the public repository
- [x] Pin a Code - OSS upstream revision
- [x] Add a reproducible bootstrap script
- [x] Add a built-in extension workspace
- [x] Open a first council panel
- [x] Add CI and architecture documentation

## Milestone 1 — Shared council context

- [x] Define Council contracts and bounded workspace/Git context
- [x] Add an evidence gate, quiet onboarding, and deterministic provider
- [x] Render zero to two explicit suggestions per role

## Milestone 2 — Codex runtime adapter

- [x] Launch `codex app-server` over JSONL stdio
- [x] Complete initialization and expose connection lifecycle
- [x] Create workspace-scoped threads with user approval routing
- [x] Start explicit text turns
- [x] Stream agent message deltas and finalize completed turns
- [x] Show the primary Codex conversation separately from the Council
- [ ] Feed the real completed turn into the Council
- [ ] Map approval requests and interruption
- [ ] Persist and resume threads

## Milestone 3 — Actionable suggestions

- [x] Prepare, edit, and copy a Council suggestion locally
- [x] Prevent automatic execution
- [ ] Insert a selected suggestion into the real Codex composer
- [ ] Add dismiss, snooze, and save-to-notes actions

## Milestone 4 — Project memory

- [ ] Add project-scoped notes and accepted decisions
- [ ] Import roadmap and Fil Rouge context when available
- [ ] Keep storage local and inspectable

## Milestone 5 — Living companions

- [ ] Define Pet Pack manifests and role assignments
- [ ] Add idle, attention, thinking, and suggestion states
- [ ] Validate accessibility and reduced motion

## Milestone 6 — Minimal native layer

- [ ] Prototype the global pet overlay
- [ ] Document and test every upstream patch

## Not planned for the early project

- autonomous multi-agent delegation;
- silent workspace modification;
- proprietary marketplace infrastructure;
- large permanent divergence from Code - OSS;
- bundled private credentials.

# Roadmap

## Milestone 0 — Distribution bootstrap

- [x] Initialize the Code - OSS distribution layer, built-in extension, CI, and documentation

## Milestone 1 — Shared council context

- [x] Define Council contracts and bounded workspace/Git context
- [x] Add evidence gating, quiet onboarding, deterministic roles, and explicit suggestions

## Milestone 2 — Codex runtime adapter

- [x] Launch `codex app-server` over JSONL stdio and complete initialization
- [x] Create workspace-scoped threads with user approval routing
- [x] Start and stream explicit text turns
- [x] Convert completed Codex exchanges into shared Council turns
- [x] Surface command and file-change approval requests
- [x] Require explicit Allow once or Deny decisions
- [x] Interrupt active turns explicitly
- [ ] Persist and resume threads

## Milestone 3 — Actionable suggestions

- [x] Prepare, edit, and copy Council suggestions locally
- [x] Prevent automatic execution
- [ ] Insert a selected Council suggestion into the real Codex composer
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

# Roadmap

## Milestone 0 — Distribution bootstrap

- [x] Pin Code - OSS and add reproducible bootstrap, CI, and integrated extension

## Milestone 1 — Shared turn context

- [x] Define Council contracts
- [x] Capture bounded editor selection and read-only Git state
- [x] Keep the Council silent without useful evidence
- [x] Add roadmap and Fil Rouge ingestion through a bounded projector

## Milestone 2 — Codex runtime

- [x] Connect and initialize `codex app-server`
- [x] Start and resume workspace threads
- [x] Stream primary turns
- [x] Surface approvals and interruption
- [x] Bridge completed turns into the Council

## Milestone 3 — Complete consultative loop

- [x] Fill the real Codex composer from a selected suggestion
- [x] Preserve user editing and explicit Send
- [x] Add Copy, Dismiss, and Snooze
- [x] Add one structured Codex-backed Council provider
- [x] Enforce zero to two suggestions per role
- [x] Fall back deterministically on failure

## Milestone 4 — Shared Context Graph

- [x] Add addressable nodes, relations, actors, and provenance
- [x] Store locally in `.filrouge/council/` or `.pets-council/`
- [x] Save accepted proposals only after explicit action
- [x] Project durable context into future Council reviews
- [x] Make the Greffier a first-class role

## Milestone 5 — Living companions

- [x] Define a Pet Pack manifest and JSON schema
- [x] Separate visual pets from role assignments
- [x] Add idle, thinking, suggestion, silent, approval, and error states
- [x] Add webview animation and reduced-motion behavior
- [x] Add click-to-open role navigation

## Milestone 6 — Native Code - OSS layer

- [x] Add a narrow global workbench overlay contribution
- [x] Add extension-to-workbench visual state commands
- [x] Add idempotent apply and verify scripts
- [x] Apply the overlay during bootstrap
- [ ] Validate the patched workbench with a full local Code - OSS compile and desktop smoke test
- [ ] Replace glyph companions with validated sprite Pet Packs
- [ ] Add movement between editor, terminal, and sidebar anchors

## Next product tranche

- [ ] Add graph queries, supersession, and open-question workflows
- [ ] Add multiple project-memory projections per actor
- [ ] Add Petdex-compatible sprite loading and the Hatch runtime v2 atlas
- [ ] Add local usage signals for accepted, dismissed, and snoozed suggestions

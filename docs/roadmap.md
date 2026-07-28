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
- [x] Add graph search and active-node queries
- [x] Add open-question creation and resolution workflows
- [x] Preserve superseded decisions while excluding them from active projections
- [x] Add separate Codex, Architect, Guardian, Strategist, and Greffier projections

## Milestone 5 — Living companions

- [x] Define a Pet Pack manifest and JSON schema
- [x] Separate visual pets from role assignments
- [x] Add idle, thinking, suggestion, silent, approval, and error states
- [x] Add webview animation and reduced-motion behavior
- [x] Add click-to-open role navigation
- [x] Add atlas-backed sprite rendering with glyph fallback
- [x] Validate strip v1 and Hatch runtime v2 atlas contracts
- [x] Anchor companions near editor, terminal, sidebar, and project memory
- [x] Ship canonical versioned vector artwork with explicit attribution and license
- [x] Add draggable, workspace-persisted positions with critical-state anchor fallback

## Milestone 6 — Native Code - OSS layer

- [x] Add a narrow global workbench overlay contribution
- [x] Add extension-to-workbench visual state commands
- [x] Add idempotent apply and verify scripts
- [x] Apply the overlay during bootstrap
- [x] Add a reproducible full Code - OSS compile smoke command
- [x] Add a manual heavyweight desktop smoke workflow
- [x] Sync the compiled integrated extension into Code - OSS
- [x] Bootstrap, patch, and fully compile the pinned Code - OSS workbench on Linux CI
- [ ] Run and capture the interactive desktop smoke on macOS, Windows, and Linux

## Milestone 7 — Local product signals

- [x] Record accepted, dismissed, and snoozed suggestions locally
- [x] Keep usage signals inspectable as bounded JSONL
- [x] Avoid remote analytics and personal identifiers
- [x] Add transparent opt-in ranking from explicit local outcomes
- [ ] Tune companion silence only after enough real usage data exists

## Milestone 8 — Desktop Preview 0.1

- [x] Add first-run onboarding without automatic connection or execution
- [x] Add read-only product diagnostics for workspace, Codex, Pet Pack, overlay, and storage
- [x] Define Preview product identity and platform application identifiers
- [x] Add reproducible unsigned package preparation and archive manifests
- [x] Add manual Linux, macOS, and Windows packaging workflows
- [ ] Complete interactive macOS smoke with a real authenticated Codex turn
- [ ] Complete interactive Windows and Linux smoke captures
- [ ] Add signing, macOS notarization, and protected release credentials
- [ ] Publish the first externally shareable Desktop Preview archive

## Next product tranche

- [ ] Replace or extend canonical vector companions with user-validated Hatch character packs
- [ ] Add a visible per-companion reset action in the native overlay
- [ ] Evaluate ranking quality from real accepted, dismissed, and snoozed outcomes
- [ ] Add crash recovery and release-channel update metadata

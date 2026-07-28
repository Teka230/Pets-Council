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
- [x] Expose the Codex model catalog and reasoning-effort selector

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
- [x] Install self-contained external Pet Packs per workspace
- [x] Restore the built-in Pet Pack explicitly

## Milestone 6 — Native Code - OSS layer

- [x] Add a narrow global workbench overlay contribution
- [x] Add extension-to-workbench visual state commands
- [x] Add idempotent apply and verify scripts
- [x] Apply the overlay during bootstrap
- [x] Add a reproducible full Code - OSS compile smoke command
- [x] Add a manual heavyweight desktop smoke workflow
- [x] Sync the compiled integrated extension into Code - OSS
- [x] Bootstrap, patch, and fully compile the pinned Code - OSS workbench on Linux CI
- [x] Add a one-time explicit Pets Council product layout
- [ ] Run and capture the interactive desktop smoke on macOS, Windows, and Linux

## Milestone 7 — Local product signals

- [x] Record accepted, dismissed, and snoozed suggestions locally
- [x] Keep usage signals inspectable as bounded JSONL
- [x] Avoid remote analytics and personal identifiers
- [x] Add opt-in aggregate local silence tuning after a per-role evidence threshold
- [x] Explain every derived role limit in a local Markdown report

## Milestone 8 — Daily conversation workflow

- [x] Restore and display a bounded multi-turn Codex timeline
- [x] Preserve the composer draft and respectful follow-tail behavior
- [x] Attach Council reviews to the turns they reviewed
- [x] Keep historical suggestion actions bound to their original turn
- [x] Browse workspace sessions through native Quick Pick
- [x] Resume, rename locally, and archive sessions explicitly

## Milestone 9 — Desktop Preview 0.1

- [x] Add manual Code - OSS packaging tasks for Linux x64, macOS arm64, and Windows x64
- [x] Verify the integrated extension inside packaged outputs
- [x] Produce portable archives, SHA-256 checksums, and reproducibility manifests
- [x] State signing and notarization status explicitly
- [x] Add clean-machine smoke and promotion checklists
- [ ] Run the three-platform artifact workflow
- [ ] Complete clean-machine interactive smoke tests
- [ ] Produce signed and notarized platform installers

## Next product tranche

- [x] Persist completed Council reviews across application restarts
- [x] Anchor Council suggestions to the open workspace, not the Pets Council product
- [ ] Add external Pet Pack archives and file-backed atlas assets
- [ ] Add draggable anchor overrides without breaking role defaults
- [ ] Replace generated built-in atlases with final validated character art
- [ ] Add signed update channels after installer trust is established

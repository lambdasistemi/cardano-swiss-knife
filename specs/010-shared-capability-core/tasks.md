# Tasks: Shared capability and backend IO core

**Input**: [spec.md](spec.md), [plan.md](plan.md), issue #10, parent #74
**Story**: One host-neutral Blockfrost/Koios implementation, consumed unchanged
by the WebUI and protected by an architecture responsibility gate.

## Slice 0 — Intake, specification, and plan (orchestrator-owned)

- [X] T001 Refresh canonical main, read #10/#74 and the epic map, inspect provider
  code paths, and establish a clean `./gate.sh` baseline.
- [X] T002 Author and validate the issue specification, implementation plan, and
  dependency-ordered slice contract in `specs/010-shared-capability-core/`.
- [X] T003 Commit the planning artifacts, push the branch, and open the draft PR
  with issue linkage and accurate initial metadata.

## Slice 1 — Shared provider contract and WebUI consumer (driver+navigator)

**Goal**: Make both providers available through one typed, host-neutral contract
and delete every WebUI-owned request implementation without touching `Main.purs`.

- [ ] T004 [US1] Add RED contract coverage for Blockfrost and Koios successful
  CBOR and validation-context loads in `test/src/Test/Provider.purs`.
- [ ] T005 [US1] Add RED contract coverage for endpoint/auth/network mapping and
  authentication, rate-limit, server, transport, and decode failures for both
  providers in `test/src/Test/Provider.purs` and optional test FFI.
- [ ] T006 [US1] Implement shared provider/network types, typed failures,
  request selection, Fetch IO, decoding, and context mapping in
  `lib/src/Cardano/Provider.purs` and `lib/src/Cardano/Provider.js`.
- [ ] T007 [US1] Preserve selected-provider-only producer/context resolution and
  explicit failure behavior in the shared core.
- [ ] T008 [US2] Convert WebUI `Provider`/`FFI.Blockfrost` modules to thin shared
  adapters and delete `Provider.js` plus Koios/Blockfrost request FFI files.
- [ ] T009 [US2] Prove `nix run .#ci-test`, inspector build, and existing provider
  Playwright journeys are GREEN with no visible behavior change.
- [ ] T010 [US1] Obtain navigator RED/GREEN approval, run `./gate.sh`, and commit
  exactly once with `Tasks: T004, T005, T006, T007, T008, T009, T010`.

## Slice 2 — Responsibility boundary and extension documentation (driver+navigator)

**Goal**: Make duplicate provider HTTP and host semantic fallbacks mechanically
rejectable, while documenting artifact ownership and extension rules.

- [ ] T011 [US3] Add a RED architecture-boundary check in
  `scripts/check-architecture-boundary.sh` and wire it into `gate.sh`.
- [ ] T012 [US3] Make the check enforce the single shared endpoint/auth location,
  no HTTP in compatibility modules, and no host semantic/fallback dependencies.
- [ ] T013 [US3] Add negative self-tests proving representative duplicate
  provider and forbidden dependency inputs are rejected.
- [ ] T014 [US3] Expand `docs/architecture/system.md` with the host/engine
  responsibility table, artifact provenance/pins, failure behavior, and shared
  provider extension procedure; reflect the boundary from `README.md`.
- [ ] T015 [US3] Obtain navigator RED/GREEN approval and prove the focused check,
  strict MkDocs build, `nix develop --quiet -c just ci`, and `./gate.sh` are
  GREEN.
- [ ] T016 Finalize task accounting, commit audit, PR body, push, and ready state
  without deleting the base-owned cumulative `gate.sh` or merging the PR.

## Dependencies and execution order

T001-T003 close before implementation. T004-T005 establish RED before T006-T008.
T009-T010 close Slice 1 before T011 begins. T011 establishes RED before
T012-T014; T015 closes implementation proof, and T016 is stamped into the same
reviewed Slice 2 commit before its final push. No implementation slices run in
parallel because Slice 2 inspects Slice 1's final source boundary.

## Commit map

- Planning: `docs: specify shared provider capability core`
- Slice 1: `refactor: extract shared provider capability`
- Slice 2: `docs: enforce shared provider responsibility boundary`

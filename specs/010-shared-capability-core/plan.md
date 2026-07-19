# Implementation Plan: Shared capability and backend IO core

**Branch**: `feat/10-shared-capability-core` | **Date**: 2026-07-19 | **Spec**: [spec.md](spec.md)

## Summary

Move the existing WebUI-owned Blockfrost/Koios implementation into one shared
PureScript capability plus host-neutral Fetch IO adapter, expose typed provider
failures, prove its full request/response contract hermetically, and keep the
WebUI on thin compatibility modules so `Main.purs` does not change. Then add a
durable architecture boundary check and responsibility/provenance documentation.

## Current state and extraction seam

- `docs/inspector/src/Provider.purs` selects providers and assembles producer
  transaction/context envelopes.
- `docs/inspector/src/Provider.js` performs context extraction/orchestration.
- `docs/inspector/src/FFI/Blockfrost.*` and `FFI/Koios.*` own endpoint, auth,
  fetch, response decoding, and context translation.
- `Main.purs` imports `Provider` and the `Network` type from `FFI.Blockfrost`.
- The shared `cardano-addresses` package already reaches the inspector through
  the local Spago package dependency.

The seam is therefore a shared `Cardano.Provider` module plus FFI file under
`lib/src/`. WebUI modules keep their current names and public signatures but
delegate/re-export shared values; their JavaScript request implementations are
deleted. This meets the cross-lane prohibition without touching `Main.purs`.

## Technical context

**Language/Version**: PureScript 0.15.16 and ECMAScript modules on Node 22+/browser Fetch
**Primary Dependencies**: existing `aff`, `aff-promise`, `either`, `effect`, `prelude`, and `strings` packages
**Storage**: none
**Testing**: existing PureScript test package, Nix apps, inspector Playwright, and `./gate.sh`
**Target Platforms**: browser today; Node 22+ hosts in later epic children
**Constraints**: no DOM/browser-storage/Node-filesystem/CLI dependency; no `Main.purs`; no new semantic implementation; no provider fallback; no new dependency/lock update expected

## Constitution check

- **One Operation Model, Multiple Hosts**: PASS — provider operations and errors
  move to the shared library.
- **Browser-First, CLI-Parity-Conscious**: PASS — the WebUI consumes the core,
  while the core stays usable under Node 22+.
- **Authoritative Cardano Engines**: PASS — only provider HTTP and host envelope
  orchestration move; engine-owned semantics stay behind pinned WASM/WASI.
- **Local-First Secret Handling**: PASS — credentials remain in memory and
  headers; no argv, environment, URL, or new persistence path is introduced.
- **Honest Capability Boundaries**: PASS — scope explicitly excludes submission,
  witnesses, store/domain state, and semantic fallback.
- **Nix canonical gate**: PASS — focused Nix proofs and the full repository gate
  are mandatory for both slices.

## Public contract

`Cardano.Provider` owns:

- `Provider` and `Network` closed types and their names/mappings;
- credential policy and provider operation labels;
- typed `ProviderError` categories for authentication, rate-limit, server,
  transport, and decode failures, with safe rendering for compatibility hosts;
- transaction-CBOR and validation-context operations returning typed outcomes;
- producer/context resolution through the selected provider only;
- the standard Fetch adapter that constructs provider-specific requests and
  decodes responses.

The module may expose a transport seam for hermetic tests, but endpoint/auth,
status classification, decode rules, and network mapping stay inside the shared
core. No host may rebuild them.

## Slice 1 — Shared provider contract and WebUI consumer

One vertical RED/GREEN commit introduces the shared contract and simultaneously
removes the WebUI-owned implementation, so final provider HTTP exists exactly
once.

### Owned files

```text
lib/src/Cardano/Provider.purs                       (new)
lib/src/Cardano/Provider.js                         (new)
test/src/Test/Provider.purs                         (new)
test/src/Test/Provider.js                           (new if transport setup needs FFI)
test/src/Test/Main.purs
docs/inspector/src/Provider.purs                    (thin compatibility adapter)
docs/inspector/src/Provider.js                      (delete)
docs/inspector/src/FFI/Blockfrost.purs              (thin type compatibility adapter)
docs/inspector/src/FFI/Blockfrost.js                (delete)
docs/inspector/src/FFI/Koios.purs                   (delete)
docs/inspector/src/FFI/Koios.js                     (delete)
```

No manifest/lock edit is expected. Any need to widen this set or touch
`Main.purs` is a Q-file blocker.

### TDD and proof

1. RED contract cases cover both providers' successful CBOR/context operations,
   endpoint/auth/network mapping, and authentication/rate-limit/server/
   transport/decode failures.
2. GREEN adds the smallest shared contract/adapter and compatibility delegation,
   then removes the old JS implementations.
3. Focused proof: `nix run .#ci-test`.
4. WebUI proof: `nix build .#tx-inspector-ui --no-link` followed by
   `nix run .#ci-inspector-playwright`.
5. Full proof: `./gate.sh`.

Commit: `refactor: extract shared provider capability`
Trailer: `Tasks: T004, T005, T006, T007, T008, T009, T010`

## Slice 2 — Responsibility boundary, provenance, and extension gate

A second RED/GREEN commit adds a focused boundary script to the cumulative
repository gate and updates architecture/README documentation. RED is the new
check failing against the pre-documentation state; GREEN is the completed
responsibility table, provenance, fail-hard behavior, and extension procedure.

### Owned files

```text
scripts/check-architecture-boundary.sh              (new)
gate.sh
docs/architecture/system.md
README.md
```

The check must at minimum prove provider endpoint/auth implementation is
confined to `lib/src/Cardano/Provider.js`, compatibility modules contain no
HTTP, manifests contain no host semantic/fallback dependencies, and required
responsibility/provenance/failure/extension documentation remains present.

### TDD and proof

1. RED: `bash scripts/check-architecture-boundary.sh` fails on at least one
   missing documentation/boundary requirement before docs are updated.
2. GREEN: the same command exits 0 and includes self-contained negative fixture
   checks for duplicate provider HTTP and forbidden semantic dependencies.
3. Documentation proof: strict MkDocs build.
4. Acceptance proof: `nix develop --quiet -c just ci`.
5. Full proof: `./gate.sh`.

Commit: `docs: enforce shared provider responsibility boundary`
Trailer: `Tasks: T011, T012, T013, T014, T015, T016`

## Integration and execution order

Slice 1 precedes Slice 2. They are not parallel: the boundary gate must inspect
the final shared source location. Each slice is one bisect-safe commit, reviewed
by a driver+navigator pair before the ticket orchestrator stamps `tasks.md` and
pushes. Bottom-row panes are `/clear`ed together between slices.

## Finalization

After Slice 2 review, the ticket orchestrator runs the final gate and commit
audit, stamps T011-T016 into the reviewed commit, updates the PR body, pushes,
and marks the draft ready. It does not merge. Because `gate.sh` is already
tracked on `origin/main` as the cumulative repo gate, it is retained rather than
deleted as a ticket-only sentinel.

## Risks and controls

- **PureScript/JS boundary erodes typing**: constructors and typed outcomes are
  owned in PureScript; JS is limited to standard Fetch and JSON adaptation.
- **Visible WebUI error drift**: compatibility adapters preserve current public
  signatures/rendered diagnostics; existing Playwright journeys are mandatory.
- **Partial context mistaken for success**: any failed context sub-request maps
  to a typed operation failure or the existing explicit resolution error, never
  synthesized success.
- **Second provider implementation survives**: deletions plus the boundary gate
  make endpoint duplication fail loudly.
- **Boundary gate becomes aspirational text**: negative fixture checks prove the
  gate itself rejects representative violations.
- **Sibling conflict**: `Main.purs` and decoded-tree labeling tests are forbidden;
  discovery that they are necessary stops in a parent Q-file.

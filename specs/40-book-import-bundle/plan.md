# Implementation Plan: Loud Amaru book bundle import

**Branch**: `feat/40-book-import-bundle` | **Date**: 2026-07-17 | **Spec**: [spec.md](spec.md)

## Summary

Recognize the Amaru bundle at the Library's shared overlay parser boundary,
convert its recognized entries into the contract-pinned local book/parts, and
add explicit success state beside existing import errors. Prove the original
no-op and all feedback paths in the shipped browser artifact.

## Technical Context

**Language/Version**: PureScript 0.15.16 and browser JavaScript
**Primary Dependencies**: Halogen 7, existing BookStore/OverlayBook FFI, RDF query runtime
**Storage**: Browser localStorage via `cardano-ledger-inspector.books.v1`
**Testing**: Playwright against the Nix-built inspector UI; full `./gate.sh`
**Target Platform**: Static browser workbench
**Project Type**: PureScript web application with JavaScript FFI
**Performance Goals**: One synchronous pass over the imported bundle; immediate feedback for normal operator-sized books
**Constraints**: Local-only, Nix-only checks, no engine or rendering changes, no vocabulary additions
**Scale/Scope**: One Library page, one parser boundary, one end-to-end test suite

## Constitution Check

- **One operation model / CLI parity**: PASS — behavior pins to the released
  interchange document rather than producer code.
- **Browser-first, parity-conscious**: PASS — browser delivery preserves a
  producer-neutral contract.
- **Authoritative engines**: PASS — no ledger or cryptographic behavior is
  implemented.
- **Local-first**: PASS — books remain in browser localStorage.
- **Honest capability boundaries**: PASS — every import reports the latest
  observed result.
- **Nix canonical build and browser verification**: PASS — focused browser
  proof and the full hermetic gate are required.

Post-design check: PASS with no justified violations.

## Project Structure

```text
docs/book-interchange.md                              # released contract
docs/inspector/src/FFI/OverlayBook.js                 # bundle parse + mapping
docs/inspector/src/FFI/OverlayBook.purs               # typed parser notice field
docs/inspector/src/Main.purs                          # feedback state/actions/view
docs/inspector/tests/fixtures/attx-book-bundle.json  # exact reproducer
docs/inspector/tests/tx-identify.spec.mjs             # browser RED/GREEN proof
gate.sh                                               # permanent extended gate
specs/40-book-import-bundle/                          # feature artifacts
```

**Structure Decision**: Extend the existing Library flow in place. Do not add a
parallel import service or change the internal store envelope.

## Slice Plan

### Slice 1 — interchange contract (released at `5ca7dd9`)

Orchestrator-owned documentation and gate inventory. It defines accepted
formats, exact IRIs/classes/prefixes, compatibility aliases, inert-part policy,
and feedback wording. This slice is frozen after its release signal.

### Slice 2 — bundle import and loud feedback

Driver+navigator RED/GREEN slice. Check in the exact fixture; first add browser
tests that reproduce the no-op, malformed atomic failure, selection, mapping,
and feedback on every path. Then minimally extend OverlayBook parsing and
its typed result plus Library state/actions/view until the focused browser
suite and full gate pass.
Commit subject: `feat: import amaru book bundles loudly`.

### Slice 3 — orchestrator finalization

Stamp completed tasks into Slice 2, independently review the full diff and
rerun `./gate.sh`, update PR #46 with contract and feedback evidence, and hand
back without marking ready or merging. The permanent repository gate remains.

## Complexity Tracking

No constitution violations or new architectural layers are introduced.

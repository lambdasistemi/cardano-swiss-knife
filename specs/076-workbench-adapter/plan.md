# Implementation Plan: IndexedDB Transaction Workbench

**Branch**: `feat/76-workbench-adapter` | **Date**: 2026-07-21 | **Spec**:
[spec.md](spec.md)

## Summary

Implement #75's `EntryStore Aff` port in a small browser FFI module backed by
IndexedDB. Add a focused Halogen `Workbench` component that owns persistent
entry collection/selection and emits selected entries to the existing
inspector. Then add vault-produced and pasted-witness workflows that reuse the
shared engine, #67 normalization, and #75 collection/completeness functions.
Keep provider submission out so #77 can consume the selected-entry component
as a separate explicit action.

## Technical context

**Language/Version**: PureScript 0.15.16, ES modules on Node/browser, Halogen

**Existing dependencies**: #75 `Cardano.Transaction.Entry` and `.Ports`, #67
`Cardano.Transaction.Witness`, `aff`, `aff-promise`, `arrays`, `either`,
`maybe`, existing `TxSigning`, `Vault`, inspector protocol adapters, IndexedDB
browser API

**Testing**: focused Node IndexedDB-contract test, PureScript app build,
root Playwright suite, architecture boundary check, `./gate.sh`

**Constraints**: no package/lockfile change; no provider submission; no domain
fork; no host ledger/CBOR/crypto/RDF semantics; exact raw/TextEnvelope parity;
all behavior slices use RED then GREEN and one commit each

## Architecture

### IndexedDB adapter

`FFI.EntryStore` exposes one `entryStore :: EntryStore Aff`. Its PureScript
side converts between #75's `TxEntry` and an explicit persisted record whose
status is a stable string. Its JavaScript side only performs IndexedDB request
and transaction mechanics. Database and object-store versions/names are
constants, the object store is keyed by `entryId`, `put` overwrites, and list
results are sorted by `entryId` before decoding.

No JS function interprets transaction or witness CBOR. Malformed records and
unknown status strings fail the Aff instead of being silently dropped.

### Workbench component and inspector handoff

`Workbench.purs` is the persistent entry boundary. It loads entries through
the injected store, renders the list/switcher and selected-entry completeness,
and emits `EntrySelected TxEntry` to `Main`. `Main` responds by setting the
existing inspector input from `unsignedTxCborHex` and invoking the same decode
pipeline; the inspector remains a view over the selection.

After a successful decode, `Main` derives an addable entry seed only from typed
engine response fields: body hash/transaction id, required signer hashes, and
finite `invalid_hereafter`. The current CBOR is already normalized by the
existing transaction decoder. Missing fields produce an explanatory disabled
state. Saving calls `putEntry` before updating the component's success state.

This module boundary is the coordination surface for #77: provider submission
can receive the selected `TxEntry` or add an explicit action without owning the
entry list, persistence, witness collection, or inspector lifecycle.

### Witness workflow

For vault production, the selected compatible vault key is passed to existing
`TxSigning.prepareWitness`. Its WASM-backed `signerHashHex` must be in the
entry's missing signer set; the raw detached witness then enters #75
`collectWitness`. Raw and #67 TextEnvelope outputs are rendered.

For pasted input, #67 normalizes raw/enveloped input. The ledger engine attaches
the witness to the selected entry's unsigned transaction and its post-attach
witness plan must show the selected missing signer as present. Only then does
#75 collect the normalized witness under that signer id. Domain or persistence
failure leaves the prior state intact. Duplicate replacement is an explicit
checkbox and follows both engine and #75 safety rules.

The UI displays `deriveCompleteness` directly; it does not duplicate signer-set
logic. Each accepted mutation is stored before the in-memory list is replaced.

## Slice 1 — IndexedDB EntryStore contract

RED adds a deterministic IndexedDB test double covering schema creation, put,
overwrite, lookup, missing lookup, deterministic list, reopen, request errors,
and malformed records. GREEN adds the explicit PureScript record codec and JS
request/transaction adapter implementing `EntryStore Aff`.

**Owned files**:

- `docs/inspector/src/FFI/EntryStore.purs` (new)
- `docs/inspector/src/FFI/EntryStore.js` (new)
- `docs/inspector/test/entry-store.test.mjs` (new)

**Focused proof**:
`nix develop --quiet -c node --test docs/inspector/test/entry-store.test.mjs`

**Commit**: `feat(web): add IndexedDB transaction entry store`

**Trailer**: `Tasks: T764, T765, T766, T767, T768`

## Slice 2 — Persistent entry list and inspector consumer

RED adds Playwright coverage for creating two finite-TTL entries, list
selection, selected completeness, IndexedDB reload persistence, and inspector
handoff. GREEN adds the focused Halogen component, typed engine-to-entry seed,
minimal `Main` slot/output wiring, and plain CSS.

**Owned files**:

- `docs/inspector/src/Workbench.purs` (new)
- `docs/inspector/src/FFI/Json.purs`
- `docs/inspector/src/FFI/Json.js`
- `docs/inspector/src/Main.purs`
- `docs/inspector/dist/styles.css`
- `tests/transactions.spec.ts`

**Focused proof**:
`nix run .#ci-playwright`

**Commit**: `feat(web): manage persistent transaction workbench entries`

**Trailer**: `Tasks: T769, T770, T771, T772, T773, T774`

## Slice 3 — Witness production, attachment, and completeness

RED extends Playwright with a two-signer flow proving vault production,
raw/TextEnvelope pasted parity, unrelated/invalid input rejection, explicit
replacement safety, 0/2→1/2→2/2 completeness, entry isolation, and reload.
GREEN adds the smallest workbench actions and engine validation needed to call
#75 and persist successful mutations.

**Owned files**:

- `docs/inspector/src/Workbench.purs`
- `docs/inspector/src/TxSigning.purs`
- `docs/inspector/src/TxSigning.js`
- `docs/inspector/src/Main.purs`
- `docs/inspector/dist/styles.css`
- `tests/transactions.spec.ts`

**Focused proof**:
`nix run .#ci-playwright`

**Commit**: `feat(web): collect workbench transaction witnesses`

**Trailer**: `Tasks: T775, T776, T777, T778, T779, T780, T781`

## Orchestrator-owned finalization

The ticket orchestrator checks each accepted slice's tasks into that same
commit, reviews every owned file, independently runs `./gate.sh`, pushes, and
waits for fresh remote CI. It communicates the final `Workbench` selection and
action structure to #77 without adding submission here. After all behavior is
green, it stamps finalization tasks while dropping `gate.sh`, marks PR #97
ready, and requires fresh remote CI again on the sentinel SHA before reporting
`COMPLETE`.

## Live-boundary review

IndexedDB is a real browser boundary: PureScript and fake-contract tests can
both pass while browser request/transaction timing is broken. The Playwright
suite therefore creates entries in Chromium's actual IndexedDB, reloads the
page, and re-reads them through the UI. This proof belongs in `./gate.sh` via
`ci-playwright`, not as an operator-only follow-up.

## Risks and controls

- **Domain fork**: all UI derivation imports #75; no parallel entry or
  completeness type is allowed.
- **IndexedDB callback hangs**: every open/request/transaction path resolves or
  rejects exactly once; direct error tests and real reload smoke cover it.
- **Corrupt persisted data**: explicit decoding fails visibly; no lossy default.
- **Host semantic fallback**: entry seed and witness relevance consume engine
  JSON; browser code never interprets CBOR or derives signer hashes.
- **Secret exposure**: existing vault unlock controls remain authoritative and
  keys stay in memory; only detached witness material is persisted in entries.
- **#77 conflict**: `Workbench.purs` is the selected-entry/action seam and this
  lane does not touch provider submission. A concrete structure note is sent as
  soon as Slice 2 freezes; genuine shared-file conflicts go through Q-files.
- **Fresh artifacts**: #90 may require a local `spago build`, but acceptance
  requires fresh GitHub Actions on the exact pushed SHAs.

## Dependency and release effect

Merged #75 and #67 are required. Slice 1 precedes UI state, Slice 2 precedes
witness mutation, and Slice 3 completes #76. The resulting selected-entry
workbench releases the browser integration point needed by parallel #77; this
ticket neither waits for nor implements provider submission.

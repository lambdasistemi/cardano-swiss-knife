# Implementation Plan: Shared TxEntry Domain

**Branch**: `feat/75-txentry-domain` | **Date**: 2026-07-21 | **Spec**:
[spec.md](spec.md)

## Summary

Add a pure `Cardano.Transaction.Entry` domain module that models transaction
entries, derives signer completeness and lifecycle status, and safely collects
raw or TextEnvelope detached witnesses through the merged #67 decoder. Add a
separate `Cardano.Transaction.Entry.Ports` module containing polymorphic
record-of-operations seams for persistence and coordination. Prove the complete
surface directly in the existing shared PureScript test package with no FFI,
manifest, host, provider, browser, or engine changes.

## Technical context

**Language/Version**: PureScript 0.15.16

**Existing dependencies**: `arrays`, `either`, `maybe`, `prelude`, and the
merged `Cardano.Transaction.Witness` / `Cardano.TextEnvelope` shared modules

**Testing**: `nix develop --quiet -c spago test -p cardano-addresses-test`,
`nix run .#ci-test`, architecture-boundary check, and `./gate.sh`

**Target platforms**: Browser and Node 22+ hosts through the shared `lib/`
package

**Constraints**: pure and host-neutral; no new package; no JS FFI; no concrete
backend or transport; no provider calls; no host-side ledger/CBOR/crypto/RDF
semantics; raw/enveloped witness handling must reuse #67

## Existing foundation

- #10 placed shared host-neutral capabilities under `lib/src/Cardano/` and
  mechanically rejects duplicated provider and host semantic implementations.
- #67 added `decodeWitnessInput`, which accepts raw detached-witness CBOR or
  exact `TxWitness ConwayEra` TextEnvelopes and rejects transaction envelopes.
- `Cardano.Transaction.Witness.attachmentSafety` already defines the broader
  transaction-attachment duplicate/required-signer policy; this domain does
  not reimplement ledger attachment or signature verification.
- The shared PureScript test package runs from `test/src/Test/Main.purs` and is
  exposed hermetically through `nix run .#ci-test`.

## Public domain contract

`Cardano.Transaction.Entry` owns:

- textual `EntryId` and `SignerId` aliases supplied by authoritative engine
  callers;
- `CollectedWitness`, pairing a signer with normalized detached-witness CBOR;
- `EntryStatus = Open | Complete | Expired | Submitted`;
- `TxEntry`, holding identifier, unsigned transaction CBOR, ordered required
  signers, collected witnesses, invalid-after slot, and persisted status;
- `EntryCompleteness`, containing required/satisfied/missing signer arrays and
  `isComplete`;
- `deriveCompleteness`, preserving required roster order and treating a signer
  as satisfied when at least one collected witness names it;
- `deriveStatus currentSlot`, with terminal-state preservation, expiry before
  completeness, and open/complete derived from the roster;
- `refreshStatus currentSlot`, returning the entry with its derived status;
- `collectWitness currentSlot`, accepting an explicit replacement flag,
  engine-derived signer id, and raw/enveloped witness input; it rejects
  submitted or slot-expired mutation,
  non-required signers, and unauthorized duplicates, delegates normalization to
  #67, replaces or appends exactly one signer witness, and refreshes live
  open/complete/expired status against the supplied slot.

The module performs no signer-hash derivation, signature verification, CBOR
inspection, or ledger witness attachment. Those remain engine-backed
operations outside this ticket.

## Port contract

`Cardano.Transaction.Entry.Ports` owns two parameterized records:

- `EntryStore m`: `putEntry`, `lookupEntry`, and `listEntries`;
- `CoordinationPort m`: `publishEntry`, `fetchEntry`, and `publishWitness`.

The effect constructor remains polymorphic so adapters can choose `Aff`,
`ExceptT`, or another host algebra. The ports expose only shared domain values;
they specify neither serialization nor a cardano-multisig endpoint.

## Slice 1 — Domain, ports, and direct contract proof

One vertical RED/GREEN commit adds failing direct tests first, receives
navigator approval of the RED handoff, and then implements the smallest shared
surface that passes them.

### Owned files

```text
lib/src/Cardano/Transaction/Entry.purs             (new)
lib/src/Cardano/Transaction/Entry/Ports.purs       (new)
test/src/Test/TransactionEntry.purs                (new)
test/src/Test/Main.purs
```

No FFI, manifest, lockfile, host, provider, fixture, engine, or configuration
edit is expected. Any additional file is a Q-file blocker.

### TDD and proof

1. RED covers required/satisfied/missing partitions, roster ordering, empty and
   full rosters, live/expiry/terminal status precedence, raw versus enveloped
   collection parity, safe duplicate replacement, invalid input, unknown
   signer, terminal rejection, and all port operations.
2. The driver records the focused RED failure and writes
   `handoffs/red.diff`; the navigator approves the behavioral strength before
   production modules are added.
3. GREEN adds the pure domain and port modules without expanding dependencies
   or crossing engine/host boundaries.
4. Focused proof:
   `nix develop --quiet -c spago test -p cardano-addresses-test`.
5. Full proof: `./gate.sh`.

**Commit**: `feat(transaction): add shared TxEntry domain`

**Trailer**: `Tasks: T754, T755, T756, T757, T758, T759, T760`

## Orchestrator-owned finalization

After the behavior commit is navigator-approved, the ticket orchestrator marks
the matching tasks complete in that same commit, independently runs the gate,
audits source boundaries and commit/task linkage, updates the draft PR, and
pushes. Completion requires fresh remote CI green on the implementation SHA.
Only then does the orchestrator stamp finalization tasks while dropping
`gate.sh` in `chore: drop gate.sh (ready for review)`, mark the PR ready, and
wait for fresh remote CI on the final sentinel SHA before reporting `COMPLETE`.

## Live-boundary review

This ticket deliberately has no live external boundary: store and coordination
are ports only. The relevant fresh-system boundary is the repository build and
test environment. Local proof therefore uses the Nix `ci-test` app, and final
acceptance requires GitHub Actions on the exact pushed SHA so missing generated
artifacts or fresh-checkout assumptions cannot be hidden by the worktree.

## Risks and controls

- **Domain starts doing ledger work**: signer ids are caller-supplied and the
  module only compares text; no CBOR/signature/hash implementation is allowed.
- **TextEnvelope behavior drifts**: witness normalization delegates directly to
  #67's `decodeWitnessInput`, and direct tests cover raw/enveloped parity plus
  wrong-envelope rejection.
- **Stored status becomes stale**: `deriveStatus` recomputes open/complete from
  witnesses, checks expiry first, and preserves terminal statuses.
- **Duplicate roster/witness input**: completeness is membership-based in
  required-roster order; safe collection keeps one witness per signer and
  requires explicit replacement.
- **Ports leak an implementation**: their effect is polymorphic and their
  values are domain-only; no serialization, IndexedDB, HTTP, provider, or
  service name enters the modules.
- **Fresh-worktree artifacts hide failure**: follow known issue #90 by running
  `nix develop -c spago build` if local output is absent, but require fresh
  remote CI rather than treating generated local output as acceptance.

## Dependency and release effect

The single behavior slice depends on merged #10 and #67. Once the final PR is
green and merged, it releases the domain/port surface required by #76's
IndexedDB/workbench adapter and #77's submit workflow. This ticket does not
dispatch or implement either downstream child.

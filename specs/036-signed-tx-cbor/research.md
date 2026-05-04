# Research: Patch Generated VKey Witnesses into Transaction CBOR

## Decision: Patch the witness set in the existing JavaScript FFI layer

**Rationale**: The app already computes detached witness material locally and already ships small focused JS helpers for Cardano-specific encoding tasks. This feature only needs transaction-shape mutation at the CBOR layer, not new cryptographic or ledger-evaluation logic.

**Alternatives considered**:

- Extend the ledger-inspector WASM with a new mutation operation. Rejected for this ticket because it would widen scope into a cross-repo engine change before proving the browser workflow.
- Add a new third-party CBOR dependency. Rejected initially because the patcher only needs a narrow subset of CBOR and can stay small and auditable in-tree.

## Decision: Re-encode patched transactions with definite-length collections

**Rationale**: The fixture transaction already contains tagged witness content and indefinite structures internally. The patcher can decode those shapes and re-encode them as definite-length CBOR while preserving the semantic structure.

**Alternatives considered**:

- Preserve the exact original indefinite encoding form. Rejected because it complicates the patcher substantially without improving the resulting transaction semantics for this use case.

## Decision: Replace same-key witnesses instead of appending duplicates

**Rationale**: Re-signing is a normal user action. Stable witness counts and signer identity are easier to reason about than duplicate entries for the same verification key.

**Alternatives considered**:

- Always append new witnesses. Rejected because it creates noisy artifacts and makes repeated signing misleading.

# Implementation Plan: Move Transaction Witness Patching from JS into PureScript

**Branch**: `feat/move-transaction-witness-patching-logic-from-js-in` | **Date**: 2026-05-04 | **Spec**: `specs/037-purs-cbor-patcher/spec.md`
**Input**: Feature specification from `/specs/037-purs-cbor-patcher/spec.md`

## Summary

Replace the large JavaScript CBOR patcher used by the transaction signing flow with a PureScript module that owns CBOR decoding, encoding, and witness-set mutation. Keep the FFI limited to xpub/public-key extraction, witness CBOR synthesis, and UTF-8 byte encoding.

## Technical Context

**Language/Version**: PureScript 0.15 with small JavaScript FFI helpers  
**Primary Dependencies**: Halogen app modules, `cardano-addresses` hex/signing utilities, Playwright regression suite  
**Storage**: No storage changes  
**Testing**: `just bundle`, targeted Playwright transaction regression, optional full Playwright suite  
**Target Platform**: Static browser app  
**Constraints**: Preserve current transaction signing behavior, avoid widening scope into upstream WASM changes, keep FFI minimal  
**Scale/Scope**: One new PureScript support module plus signing-module rewiring

## Constitution Check

- **One operation model, multiple hosts**: Pass. This keeps the existing transaction-signing operation shape and only changes the implementation boundary.
- **Browser-first, CLI-parity-conscious**: Pass. A PureScript CBOR patcher is easier to mirror in a future CLI host than a browser-only JS blob.
- **Authoritative Cardano engines**: Pass with scope guard. The refactor does not replace signing primitives or ledger inspection logic; it only relocates witness-set mutation code.
- **Honest capability boundaries**: Pass. The PureScript patcher keeps the same explicit failure path for malformed or unsupported CBOR input.

## Project Structure

### Documentation

```text
specs/037-purs-cbor-patcher/
├── plan.md
├── spec.md
└── tasks.md
```

### Source Code

```text
app/src/TxInspector/
├── Cbor.js
├── Cbor.purs
├── Signing.js
└── Signing.purs

tests/
└── transactions.spec.ts
```

## Implementation Strategy

1. Keep the existing transaction signing regression as the behavioral guardrail.
2. Introduce a PureScript CBOR AST that preserves raw scalar encodings while normalizing collections and text/byte chunks.
3. Move witness-set patching into PureScript and rewire `TxInspector.Signing` to call it directly.
4. Shrink the FFI to only the unavoidable byte-level helpers.
5. Re-run build and browser verification on the refactored path.

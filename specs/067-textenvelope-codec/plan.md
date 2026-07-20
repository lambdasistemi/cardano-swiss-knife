# Implementation Plan: Cardano CLI TextEnvelope codec

**Branch**: `feat/67-textenvelope-codec` | **Date**: 2026-07-20 | **Spec**: [spec.md](spec.md)

## Summary

Add one host-neutral shared-library module that validates CBOR hexadecimal
text, auto-detects the two supported cardano-cli TextEnvelope JSON types, and
encodes transaction or detached-witness envelopes with exact cardano-cli type
strings. Prove the contract directly in the shared PureScript test package,
then pin the delivered API and coverage into the cumulative repository gate.

## Technical context

**Language/Version**: PureScript 0.15.16 with a small ECMAScript JSON FFI
**Primary Dependencies**: existing `either`, `maybe`, `prelude`, and `strings`
packages; platform `JSON.parse`/`JSON.stringify`
**Testing**: existing `cardano-addresses-test` package and `./gate.sh`
**Target Platforms**: browser and Node 22+
**Constraints**: no DOM, storage, filesystem, CLI, network, node, engine, or
new package dependency; exact `Tx ConwayEra` / `TxWitness ConwayEra` strings

## Public contract

`Cardano.TextEnvelope` owns:

- a closed `TextEnvelopeType` for transactions and detached witnesses;
- the exact cardano-cli type-string mapping;
- decoded input carrying validated `cborHex`, optional detected envelope type,
  and optional description;
- `decodeCborInput`, which distinguishes a JSON-looking input from raw hex and
  never falls back to raw hex after malformed envelope JSON;
- `encodeTextEnvelope`, which validates the payload and emits the three-field
  standard JSON object with `Ledger Cddl Format`.

PureScript owns the domain types and error surface. JavaScript is limited to
safe JSON parsing/stringifying and reports plain records back to PureScript.

## Slice 1 — Shared codec and direct contract proof

One vertical RED/GREEN commit introduces failing direct tests first, receives
navigator approval of the RED handoff, and then implements the smallest shared
codec that passes them.

### Owned files

```text
lib/src/Cardano/TextEnvelope.purs             (new)
lib/src/Cardano/TextEnvelope.js               (new)
test/src/Test/TextEnvelope.purs                (new)
test/src/Test/Main.purs
```

No manifest or lock edit is expected. Discovery that another production or
test file is required is a Q-file blocker.

### TDD and proof

1. RED covers raw hex, both exact TextEnvelope types, exact encoded fields,
   round-trips, malformed/missing/wrongly typed JSON fields, unsupported types,
   and invalid CBOR hexadecimal text.
2. GREEN adds the closed type, deterministic errors, validation, detection,
   decoding, and encoding.
3. Focused proof: `nix develop --quiet -c spago test -p cardano-addresses-test`.
4. Full proof: `./gate.sh`.

Commit: `feat: add Cardano TextEnvelope codec`
Trailer: `Tasks: T674, T675, T676, T677`

## Slice 2 — Cumulative gate and PR proof

An orchestrator-owned final slice extends the existing additive `gate.sh`
inventory with anchors for the shared module, exact type strings, direct test
wiring, and representative rejection/round-trip coverage. It then runs the
full gate, audits task/commit linkage, and finalizes PR metadata.

### Owned files

```text
gate.sh
specs/067-textenvelope-codec/tasks.md
```

This slice does not edit production code, tests, fixtures, manifests, generated
artifacts, or other configuration.

Commit: `chore: extend gate.sh with TextEnvelope proof`
Trailer: `Tasks: T678, T679`

## Execution order

Slice 1 precedes Slice 2 because the cumulative gate must reference delivered
source and tests. The driver and navigator work as a pair on Slice 1; both
bottom panes are cleared after acceptance. Slice 2 is orchestrator-owned.

## Risks and controls

- **JSON mistaken for raw hex**: any trimmed input beginning with `{` is treated
  as an envelope attempt and malformed content fails deterministically.
- **Invented type drift**: a closed mapping and direct exact-string assertions
  cover only the two issue-approved values.
- **Invalid payload exported**: shared validation is applied to raw input,
  decoded `cborHex`, and encoding.
- **Host leakage**: owned files are confined to the existing shared library and
  direct-test packages; no host adapter or dependency change is permitted.
- **Consumer scope creep**: paste/file/drop/download wiring remains for the
  later tickets identified by the epic and is explicitly excluded here.

## Finalization

After the behavior slice is reviewed and pushed, run the final gate, commit the
additive gate proof with complete task accounting, update the draft PR body,
and mark it ready for independent review. Do not merge.

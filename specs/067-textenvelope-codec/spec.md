# Cardano CLI TextEnvelope codec — issue #67

**Feature Branch**: `feat/67-textenvelope-codec`
**Created**: 2026-07-20
**Status**: Draft
**Input**: Accept and produce cardano-cli TextEnvelope JSON for Conway
transactions and detached witnesses.

## User Scenarios & Testing

### User Story 1 — Accept standard transaction interchange (Priority: P1)

As an operator, I can provide either CBOR hex or a cardano-cli TextEnvelope to
a transaction workflow without manually extracting `cborHex` first.

**Independent Test**: Decode raw hexadecimal input plus transaction and witness
TextEnvelopes and obtain the same CBOR hexadecimal payload, with the envelope
artifact type retained when present.

**Acceptance Scenarios**:

1. **Given** raw CBOR hexadecimal text, **when** it is decoded, **then** the
   validated hexadecimal payload is returned with no envelope type.
2. **Given** a JSON object whose type is exactly `Tx ConwayEra`, **when** it is
   decoded, **then** its validated `cborHex` and transaction artifact type are
   returned.
3. **Given** a JSON object whose type is exactly `TxWitness ConwayEra`, **when**
   it is decoded, **then** its validated `cborHex` and witness artifact type are
   returned.
4. **Given** malformed JSON, missing or wrongly typed fields, an unsupported
   type string, empty CBOR, odd-length CBOR, or non-hexadecimal CBOR, **when**
   it is decoded, **then** a deterministic error is returned rather than
   treating the input as valid raw hex.

### User Story 2 — Produce cardano-cli-compatible envelopes (Priority: P1)

As an operator, I can export a signed Conway transaction or detached witness in
the standard JSON shape and pass it directly to cardano-cli or
cardano-tx-tools.

**Independent Test**: Encode both supported artifact types, parse the produced
JSON, and verify its `type`, `description`, and `cborHex` fields before decoding
it back through the same codec.

**Acceptance Scenarios**:

1. **Given** valid transaction CBOR hex, **when** a transaction envelope is
   encoded, **then** the exact type string is `Tx ConwayEra`.
2. **Given** valid detached-witness CBOR hex, **when** a witness envelope is
   encoded, **then** the exact type string is `TxWitness ConwayEra`.
3. **Given** either supported artifact, **when** it is encoded, **then** the
   output has the cardano-cli fields `type`, `description`, and `cborHex`, uses
   `Ledger Cddl Format` as its description, and round-trips without changing
   the CBOR hexadecimal payload or artifact type.

### User Story 3 — Reuse one codec across hosts (Priority: P2)

As a maintainer of browser and Node hosts, I can consume the same codec without
depending on DOM APIs, browser storage, filesystem access, CLI argument
parsing, or a Cardano node.

**Independent Test**: Run the shared library test package under its existing
Node-based Nix test application with no host adapter involved.

## Requirements

### Functional Requirements

- **FR-001**: The shared library MUST expose a closed artifact type containing
  Conway transactions and Conway detached witnesses.
- **FR-002**: The codec MUST map those artifacts to exactly `Tx ConwayEra` and
  `TxWitness ConwayEra`.
- **FR-003**: Input decoding MUST auto-detect supported TextEnvelope JSON versus
  raw hexadecimal text.
- **FR-004**: Input decoding MUST return validated CBOR hexadecimal text and
  retain the detected envelope artifact type when one was present.
- **FR-005**: TextEnvelope decoding MUST require string-valued `type`,
  `description`, and `cborHex` fields.
- **FR-006**: The codec MUST reject malformed envelope JSON, unsupported or
  invented type strings, and invalid hexadecimal payloads with deterministic
  errors.
- **FR-007**: Output encoding MUST emit the standard three-field TextEnvelope
  object with the exact artifact type string and `Ledger Cddl Format`
  description.
- **FR-008**: Encoding MUST reject empty, odd-length, or non-hexadecimal CBOR
  text rather than emitting an invalid envelope.
- **FR-009**: Encoding followed by decoding MUST preserve artifact type and
  CBOR hexadecimal payload.
- **FR-010**: The codec MUST live in the shared `lib/` package and MUST NOT
  depend on browser, filesystem, CLI, network, or node facilities.
- **FR-011**: Direct tests MUST cover raw hex, both supported envelope types,
  exact output fields, round-trips, malformed JSON, invalid fields, unsupported
  types, and invalid hexadecimal payloads.

## Success Criteria

- **SC-001**: Direct tests accept raw hexadecimal input and both exact Conway
  TextEnvelope types with zero mismatches.
- **SC-002**: Direct tests reject every specified malformed and unsupported
  input class with zero false accepts.
- **SC-003**: Transaction and witness outputs each parse to exactly the required
  type string and round-trip with unchanged CBOR hexadecimal payload.
- **SC-004**: The shared library test package and complete repository gate both
  exit zero.

## Assumptions

- This codec receives textual input. Binary file reading and conversion to text
  belong to host adapters in later tickets.
- Leading and trailing whitespace around input is insignificant; hexadecimal
  letter case is preserved.
- Extra JSON fields do not alter the standard fields and may be ignored on
  input for compatibility.
- The description is retained from decoded envelopes for inspection, while
  codec-produced envelopes use the cardano-cli-compatible default description.

## Non-goals

- Wiring paste, file-drop, signed-transaction download, or witness-download UI.
- CLI commands, Node filesystem adapters, transaction storage, or submission.
- Witness raw-versus-enveloped merge behavior tracked by #66.
- Validating the CBOR data model beyond its non-empty even-length hexadecimal
  representation.
- Supporting eras or artifact type strings other than the two named by #67.

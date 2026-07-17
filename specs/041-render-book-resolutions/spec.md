# Feature Specification: Render book resolutions

**Feature Branch**: `feat/41-render-book-resolutions`
**Created**: 2026-07-17
**Status**: In progress
**Input**: cardano-swiss-knife issue #41, parent epic #45, and A-001

## P1 user story

As a workbench user inspecting a treasury transaction with an Amaru book
selected, I see the book's names beside the identifiers I read in Structure
and Witness, rather than a resolution count followed only by raw hex.

## Acceptance scenarios

1. Given the checked-in treasury reorganize transaction and only the exact
   Amaru bundle fixture selected, expanding the Structure resolution disclosure
   renders `network_compliance scope owner` plus its matched identifier as DOM
   text. The disclosure count equals its unique rendered entries.
2. Given either Structure row style, every tree row that already carries a
   resolved identifier uses the same generic label affordance: the name is
   inline in B-Labeled and remains discoverable in A-Quiet.
3. Given the Witness tab, declared and missing signer rows for
   `8bd03209...` render `network_compliance scope owner` next to the unchanged,
   copyable hash.
4. Given the engine's `intent.value.outputs[]`, output-address rows retain the
   full `address_hex` and render a matching book name next to the unchanged,
   copyable hex when one resolves.
5. The original symptom is proven RED before implementation and GREEN after;
   the focused inspector Playwright suite and full repository gate pass.

## Functional requirements

- **FR-001**: Resolution display MUST be keyed generically by identifier data,
  not by row label, row index, treasury name, or special-cased row kind.
- **FR-002**: The presentation layer MUST reuse resolution results already
  produced by the RDF/book pipeline and MUST NOT change what resolves.
- **FR-003**: The Structure counter MUST be an interactive, automatable
  disclosure. After activation, every counted unique resolution MUST appear as
  label plus IRI/hex in DOM text; hover-only evidence is forbidden.
- **FR-004**: B-Labeled tree rows MUST show resolved names inline. A-Quiet rows
  MUST keep names discoverable without depending only on hover.
- **FR-005**: Witness declared-signer, missing-signer, and output-address rows
  MUST preserve full identifier candidates through the typed view model and
  show a resolved name next to raw text when the shared index matches.
- **FR-006**: Raw hashes and address hex MUST remain visible and copyable; a
  name augments rather than replaces operator evidence.
- **FR-007**: The exact unsigned reorganize fixture MUST be copied unchanged
  from `/tmp/attx-csk-journey/reorganize/unsigned-tx.hex`; its SHA-256 is
  `11ba0b62566367e6dfd76eb6d06e4dc6474cf145d434b596d047377b69d1fb75`.
- **FR-008**: Playwright MUST import the existing exact
  `attx-book-bundle.json`, deselect seed books so label precedence is
  deterministic, and assert the scope-owner name in both Structure and
  Witness on the treasury fixture.
- **FR-009**: The implementation MUST consume `intent.value.outputs[]` already
  returned by the engine; it MUST NOT add provider calls, server calls,
  telemetry, or engine changes.
- **FR-010**: The extended permanent repository gate MUST pin the new fixture
  and browser regression proof.

## Boundary with issue #42

Issue #42 owns correcting the false-absent `required_signers`, ttl, and
withdrawals Structure nodes. This ticket MUST NOT pull that structural fix
forward. A-001 requires the resolution disclosure to make the owner visible in
Structure now and requires the row renderer to be generic so #42's future
required-signer row picks up the owner name without further rendering work.
The tree-row assertion itself is deferred to #42.

## Success criteria

- **SC-001**: On the treasury fixture, the Structure disclosure and Witness
  each contain exact DOM text `network_compliance scope owner`.
- **SC-002**: The disclosure's numeric count equals the number of unique
  label/identifier entries it renders.
- **SC-003**: Both declared and missing signer rows retain the full owner hash
  and show its name; an output row retains full address hex and shows its name.
- **SC-004**: Structure behavior is verified in both A-Quiet and B-Labeled.
- **SC-005**: `nix run .#ci-inspector-playwright` and `./gate.sh` exit 0.

## Out of scope

- Required-signers/ttl/withdrawals present-versus-absent repair (#42).
- Blueprint/CIP-57 datum decoding, new book formats, import changes, new
  overlay vocabulary, or any resolution-semantic change.


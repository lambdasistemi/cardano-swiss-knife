# Research: Bookable decoded-tree identifiers

## Decision: Put policy in a dedicated shared PureScript module

Use `lib/src/Cardano/BookableIdentifier.purs` as a sibling to the shared
provider and address modules.

**Rationale**: The merged #10 foundation establishes `lib/src/Cardano/` as
the host-neutral package already consumed by the inspector WebUI. A dedicated
module keeps identifier policy separate from provider IO and presentation.

**Alternatives considered**:

- Put the function in `Cardano.Provider`: rejected because bookability is
  unrelated to provider selection or transport.
- Put it in `docs/inspector/src/Main.purs`: rejected because that would make
  domain policy WebUI-only.
- Put it in JavaScript FFI: rejected because the predicate is a small total
  PureScript function with no foreign dependency.

## Decision: Classify by decoded semantic kind

Accept exactly `address`, `key`, `script`, and `script_hash`; reject all
other strings.

**Rationale**: The decoded projection already distinguishes reusable address
and verification-key rows from generic hashes, references, outputs, and raw
payloads. A closed allowlist fails safely for unknown future kinds and prevents
annotation data alone from making a one-off identity bookable.

**Alternatives considered**:

- Infer from annotation predicates such as `cardano:bytesHex`: rejected
  because the same predicate appears on both reusable keys and one-off hashes.
- Infer from row labels or IDs: rejected because presentation text and tree
  position are not stable domain types.
- Use a denylist: rejected because new transaction-scoped kinds would become
  bookable by default.

## Decision: Preserve one browser journey and add direct policy proof

Move local-book creation from the output row to the address row, remove datum
hash labeling, retain verification-key append coverage, and assert absent
actions on representative non-bookable rows.

**Rationale**: The existing journey already proves persistence and immediate
resolution. Updating it demonstrates the user-visible restriction without
duplicating a long end-to-end setup. Direct shared tests cover the complete
allowlist, including script kinds absent from the fixture.

**Alternatives considered**:

- Add a separate full browser journey: rejected as slower and duplicative.
- Browser proof only: rejected because the fixture cannot cover every shared
  semantic kind and would not independently prove host-neutral policy.

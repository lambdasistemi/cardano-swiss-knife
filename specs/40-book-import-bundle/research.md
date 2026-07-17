# Research: Loud Amaru book bundle import

## Bundle dispatch boundary

**Decision**: Extend the existing overlay-book parser to recognize
`amaru.book.bundle.v1` before the generic journal-object path.

**Rationale**: Book Turtle, Book file, and Book URL already converge on that
parser. One strict dispatch keeps JSON validation and bundle-to-part conversion
consistent across the three paths.

**Alternatives considered**: Parse only in the file action (would leave URL
silent/inconsistent); teach the store parser about bundles (would mix an
external interchange shape with the internal store envelope).

## Compatibility keys

**Decision**: Treat unprefixed keys from the current amaru-treasury-tx import
module as canonical and accept the `named:*`/`free:*` keys as compatibility
aliases. Reject both aliases appearing together.

**Rationale**: The exact required reproducer uses `named:wallets`, while the
current source reference encodes `wallets`. Accepting both closes the observed
failure without making ambiguous duplicates possible.

**Alternatives considered**: Accept only the reproducer key (drifts from the
current producer); accept only the current key (does not fix the regression).

## Reference and free-text entries

**Decision**: Retain them as inert labeled parts with empty Turtle.

**Rationale**: The store part model already permits non-RDF payloads. Part
accounting remains honest, while unsupported values cannot accidentally affect
resolution.

**Alternatives considered**: Drop them (silent data loss); invent RDF classes
(forbidden vocabulary redesign).

## Import feedback

**Decision**: Model success separately from the existing error state and clear
the opposite state on every attempt.

**Rationale**: A success message must remain visible without being formatted as
an error, and stale success/error text must never contradict the latest action.

**Alternatives considered**: Infer success only from the new card (the current
silent-no-op failure proves this is insufficient); reuse the error field for
success (misrepresents state and accessibility semantics).

## Verification slice

**Decision**: Land parser, feedback, exact fixture, and browser regression proof
in one behavior-changing slice after the released contract slice.

**Rationale**: The same end-to-end P1 journey and test file exercise all three
changes. Splitting them would leave an intermediate commit that either imports
silently or displays success for an unsupported format.

**Alternatives considered**: Parser then feedback as separate commits (not
independently complete); test-only baseline commit (not bisect-safe on the PR).

## Gate lifecycle

**Decision**: Keep and extend the repository-owned `gate.sh`; do not remove it
during PR finalization.

**Rationale**: The file is present on `origin/main` as the canonical hermetic
gate, not a temporary resolve-ticket sentinel. Removing it would delete an
existing project quality surface.

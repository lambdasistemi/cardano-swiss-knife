# Q-002 — contradictory `--book` non-review contract

GREEN is frozen and otherwise reviewable, but the slice brief contains two incompatible
requirements:

1. “All three flags stay rejected (exit 2) for non-`review` transaction commands.”
2. “Existing `--book` behaviour is unchanged.”

At baseline, `--book` is accepted for non-review transaction commands and is passed as
the legacy `books` option. The existing test
`"routes all transaction commands from raw CBOR and TextEnvelope files with stable human
and JSON envelopes"` explicitly invokes `inspect`, `browse`, `identify`, and `intent`
with repeated `--book` and asserts the imported books. The plan also describes this as
“the legacy `books` option used elsewhere.”

The frozen GREEN diff preserves that legacy `--book` behavior and rejects only the two
new flags (`--protocol-book`, `--user-book`) outside `review`; the full suite passes
97/97. Rejecting `--book` outside `review` would intentionally break the baseline tests
and the “existing behavior unchanged” clause.

Please rule which interpretation governs:

- preserve legacy non-review `--book`, rejecting only the two new flags there; or
- reject literal all three outside `review`, requiring an explicit contract/test change.

No GREEN approval will be issued until this conflict is resolved.

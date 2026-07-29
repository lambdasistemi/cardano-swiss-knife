# Q-001 — issue #121 asks the fixture to prove "exact asset amounts"; `tx.review` never exposes them

**Worker:** csk-121 (ticket-orchestrator, pane %3049)
**Raised:** during plan/contract mapping, before any slice dispatch. NOT blocking —
see "How I intend to proceed" below; answer changes the fixture's assertion set only.

## The criterion

Issue #121, last acceptance bullet:

> A regression fixture proves signer-controlled change, external-key value, and
> script-locked value are unambiguous with **exact lovelace/asset amounts**, not
> collapsed categories.

Your brief carries the same wording.

## What the merged inspector actually exposes

I read the canonical schema and the Haskell producer at the merged inspector head
(`b99028af070c85211098cbfee87bb5a80e4639df`):

- `cardano-ledger-inspector/specs/001-ledger-functional-layer/schemas/tx-review-result.schema.json`,
  `$defs.controlGroup.required` =
  `category, addresses, output_indices, output_count, lovelace, asset_class_count,
  role, role_provenance, evidence`.
- `libs/cardano-ledger-inspector/src/Conway/Inspector/Review.hs:131` — the field is
  documented verbatim as "Number of distinct non-ADA **asset classes**", emitted at
  line 150 as `"asset_class_count" .= assets`.

So per control group the review result carries:

- **exact lovelace** — yes, `lovelace` is a `decimal` (string of digits), exact.
- **exact per-asset amounts** — **no**. There is no policy id, no asset name, and no
  quantity anywhere in `tx.review`. Only a cardinality: how many distinct non-ADA
  asset classes the group holds. The golden envelope from #120 shows
  `"asset_class_count": 1` for the script group with zero further asset detail.

There is no other field, and no `additionalProperties` in practice, carrying asset
quantities. `tx.rdf` has richer asset data, but composing it into the review render
would be exactly the host-side meaning reconstruction this repair lane exists to
delete, and A-005 scoped `tx.rdf` to two mechanical uses only (book decoration and
provider-context outref discovery).

## Why this is a Q and not my call

The brief's rule is explicit: render what the inspector reports, and if the issue
truly requires something the inspector does not expose, escalate rather than invent.
Making the fixture assert "exact asset amounts" would require me to synthesise them
host-side. That is the defect class, not the fix.

## How I intend to proceed absent an answer (default, not a request to skip)

Read the criterion as satisfied by *inspector-exact* values rather than by asset
quantities the contract has never had:

1. The fixture asserts, per control group, the **exact** `lovelace` decimal string
   and the **exact** `asset_class_count` integer, rendered without rounding, unit
   conversion, or aggregation.
2. It covers all three required cases — `signer_controlled` change, `external_key`
   value, `script`-locked value — each as its own row with its own category, role,
   role_provenance and evidence list, never collapsed.
3. The renderer labels the asset column as a **count of asset classes**, so a signer
   cannot misread it as an amount. No fabricated quantities, no "N assets worth X".

That keeps the criterion's actual intent — the three cases are unambiguous and
exact — while staying inside the inspector's contract.

## What I need from you

Pick one:

- **A. Confirm the default above.** I proceed as described; no further change.
- **B. Per-asset amounts are genuinely required for #121.** Then this is an upstream
  gap in `cardano-ledger-inspector` `tx.review`, not CLI work — please open the
  upstream issue and tell me whether #121 waits for it or ships under A and picks it
  up later. I will annotate the fixture `workaround-for=<repo>#<N>` (or
  `workaround-for=UNFILED` until you supply a number) either way.

## Impact if you take longer than ~30 minutes

None on sequencing. Bootstrap, spec, plan, gate and the earlier slices do not depend
on this; only the final regression-fixture slice's assertion set does. I will dispatch
under default A if I reach that slice without an answer, and log
`NOTE PROCEEDING-UNDER-Q-001-DEFAULT-A` when I do.

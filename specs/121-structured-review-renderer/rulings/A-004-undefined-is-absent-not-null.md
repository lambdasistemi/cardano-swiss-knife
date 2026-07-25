# A-004 — the `undefined` filter is CORRECT. My A-003 wording was imprecise. Keep the code.

Ticket orchestrator (`%3049`). Q-003 identifies a real inconsistency, and it is between my
ruling's text and the code — not a defect in the code. The code wins.

## Ruling: keep `source[key] !== undefined` exactly as written

I verified all three relevant facts rather than reasoning from the wording:

1. **The filter does not drop `null`.** On `{a: null, b: undefined, c: 1}` it keeps `a` and
   `c` and drops only `b`. Your own pinning test proves the consequence:
   `missing_note (not reported)` renders, because `null !== undefined`.
2. **`JSON.parse` can never produce an `undefined` value.** A parsed envelope yields `null`
   (typeof `object`) but never `undefined`. So for any real inspector envelope the filter is
   a no-op on the unknown-kind path — it can only ever matter for a hand-built object.
3. **The filter is load-bearing for KNOWN kinds.** `SOURCE_FIELDS` lists the schema-declared
   fields per variant, and variants differ: `withdrawal` has `count`/`lovelace`, while
   `regular_input` has `count`/`resolved_count`/`missing_count`/`resolved_lovelace`. Without
   the filter a `withdrawal` entry would render `resolved (not reported) missing
   (not reported) resolved lovelace (not reported)` — inventing absent fields, which is the
   opposite of what this renderer is for and would break the contract's worked example.

## What I got wrong

A-003 listed "string, number, boolean, null, undefined" as scalars rendering through
`scalar`, and said "`null`/`undefined` → `(not reported)`". Lumping those two together was
sloppy. They mean different things:

- **absent** (`undefined`, key not present, or field inapplicable to this variant) → the
  field is **not rendered at all**
- **present but null** (`null`) → the field **is** rendered, as `(not reported)`

That distinction is not a nicety; it is the same principle already load-bearing elsewhere in
this ticket. An absent `resolutions` key omits the Book resolutions section entirely, while a
present-but-empty array renders the heading with `(none)` — because #120 proved the host must
not synthesise what the engine did not report. "Absent" and "reported as nothing" are
different facts about the transaction, and a signer-facing screen must not conflate them.

## Action

None on the code. Do **not** change `sourceLine`. Log `RESUMED Q-003` and re-request green
review pointing at the unchanged artifact — no re-freeze is needed, since nothing changes.

I am correcting the ruling text so the committed decision record does not contradict the
implementation.

## Addendum — on "the regression test covers null but not undefined"

Correct observation, and no extra test is required. A test asserting `undefined` → skipped
would pin behaviour unreachable from a real envelope, since `JSON.parse` cannot produce
`undefined`. It would be a test of a hand-built object, not of the contract.

The filter's *real* purpose — a known variant omitting fields that do not apply to it — is
already covered, and by the strongest available evidence rather than a synthetic case. The
frozen Amaru envelope carries four source variants with genuinely different field sets:

- `regular_input` — count, missing_count, resolved_count, resolved_lovelace
- `withdrawal` — count, lovelace
- `collateral` — body_total_lovelace, conditional, input_count, return_lovelace
- `reference_input` — count, read_only

If the filter were removed, every one of those would sprout `(not reported)` entries for the
other variants' fields and the golden comparison would fail immediately. So the behaviour is
pinned end-to-end by T018's golden against a real inspector envelope, which is better
coverage than an artificial `undefined` fixture would give.

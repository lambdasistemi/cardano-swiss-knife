# A-003 — ruling on the lossless encoding for unrecognised source fields

Ticket orchestrator (`%3049`). Q-002 is **correct and confirmed**, and you were right to
escalate the encoding rather than invent a display shape. The same ruling has gone to the
driver.

## The defect is real

`plan.md:168-171` says an unrecognised source `kind` "renders its fields verbatim in
envelope key order rather than being dropped". The current fallback breaks *verbatim* twice:

- `key.replace(/_/g, " ")` turns `future_field` into `future field` — the field name is not
  preserved.
- `scalar(value)` falls through to `String(value)`, so an object renders `[object Object]`
  and an array renders comma-coerced text — information is destroyed.

The second is the serious one. This section exists specifically so a future inspector field
is never silently lost, and the current code loses it while appearing to render it — the
same failure shape as a check that passes because it tested less than it claimed.

## Ruling — the encoding

For an unrecognised source `kind`, per field, in `Object.keys` order excluding `kind`:

1. **Field name renders verbatim** — the raw envelope key, underscores intact. No
   prettification.
2. **Scalar values** (string, number, boolean, null, undefined) render through the existing
   `scalar` helper, so `null`/`undefined` → `(not reported)` and booleans → `yes`/`no`,
   consistent with the rest of the document.
3. **Structured values** (object, array) render as **compact `JSON.stringify(value)`** — no
   spaces, no indentation. This is lossless, deterministic (`JSON.stringify` preserves key
   insertion order, which for a parsed envelope is document order), and keeps the
   contract's one-line-per-source shape intact.
4. **One line per source is retained.** Do not convert unknown sources into an indented
   block; that shape belongs to `Additional inspector fields`, where the value is
   top-level and pretty-printed.

Known source kinds are unaffected — they keep their human labels and schema-declared order
exactly as the worked example shows. The asymmetry is deliberate: for a known kind we know
what the field means and can name it for a signer; for an unknown one we do not, so we show
exactly what arrived.

## Also required — pin it with a test

This behaviour is currently unproven. The driver will add one renderer test: an unrecognised
source kind carrying an underscored key and a structured value, asserting the raw key
appears unmodified, the structured value round-trips losslessly through the rendered line,
and envelope key order is preserved.

Without that, the fix is an unverified edit to code you already found wrong once.

## At re-review

Check that known-kind rendering did not change, that no other section was touched, and that
the new test genuinely fails against the current lossy implementation before it passes
against the fix.

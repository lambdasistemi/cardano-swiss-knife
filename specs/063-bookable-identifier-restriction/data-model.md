# Data model: Bookable decoded-tree identifiers

## Decoded identifier

Existing data supplied to Structure rendering.

- `kind`: semantic identifier kind.
- `entityIri`: annotation subject when available.
- `annotationPredicate`: annotation predicate when available.
- `annotationValue`: reusable or raw identifier value when available.
- `resolvedLabel`: current resolved label, if any.

No field or wire-shape changes are introduced.

## Bookability classification

Derived, stateless Boolean result from `kind`.

| Kind | Bookable | Reason |
|---|---:|---|
| `address` | yes | reusable Cardano address |
| `key` | yes | reusable credential/verification key |
| `script` | yes | reusable script identifier |
| `script_hash` | yes | reusable script hash |
| `hash` | no | ambiguous/generic, including one-off transaction payload hashes |
| `tx-out-ref` | no | transaction-scoped output reference |
| `output` | no | transaction-scoped output identity |
| `integer` | no | index/value, not an identity |
| `raw-bytes` | no | transaction payload |
| empty/unknown | no | fail-closed default |

## Annotation-action eligibility

The action is visible only when all conditions hold:

1. The row has no resolved label.
2. The row kind is bookable.
3. The annotation predicate is non-empty.
4. The annotation value is non-empty.

The transition from eligible to editing/saved/resolved is unchanged.

# Step A GREEN ambiguity — unrecognised source fields

The formal Step A freeze is complete and hash-matched. The renderer has one
contract-level defect not covered by T011-T016.

`plan.md` says:

> An unrecognised source `kind` renders its fields verbatim in envelope key
> order rather than being dropped.

The fallback in `sourceLine` currently does:

```js
Object.keys(source)
  .filter((key) => key !== "kind")
  .map((key) => [key.replace(/_/g, " "), key])
```

and then passes each value through `scalar`, whose fallback is `String(value)`.
Consequently:

- `future_field` is changed to `future field`, so the field name is not
  verbatim.
- an object or array value becomes `[object Object]` or comma-coerced text, so
  information is lost rather than passed through verbatim.

The renderer must preserve unknown source field names, values, and envelope key
order while retaining the contract's one-line-per-source rule. Please rule the
exact lossless encoding for structured values (for example compact
`JSON.stringify(value)`) before directing the driver; I will not invent a
display shape the contract does not state.

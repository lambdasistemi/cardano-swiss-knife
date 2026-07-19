# Implementation Plan: Deduplicate serialized book prefixes

## Technical context

`FFI.BookStore.serializeImpl` is the host-neutral JSON serialization boundary
used by localStorage persistence and book export. Repeated annotations append
complete Turtle fragments, so duplicate prefix declarations can be removed at
this boundary without changing the sibling-owned UI flow.

## Scope boundary

Owned implementation and proof files:

- `docs/inspector/src/FFI/BookStore.js`
- `docs/inspector/test/book-store.test.mjs` (new standalone Node test, outside Playwright's `tests/` directory)

Explicitly excluded:

- `docs/inspector/src/Main.purs`
- `docs/inspector/tests/tx-identify.spec.mjs`
- all CLI/Node product surfaces planned by #71

## Slice 1: Canonical serialized Turtle

Add a pure line-oriented canonicalizer at the serializer boundary. It tracks
normalized `@prefix` declaration lines, retains the first occurrence, removes
later equivalent occurrences, and preserves other lines and distinct
declarations. Apply it to book `raw`, book `turtle`, and part `turtle` while
constructing the normalized copy returned by serialization.

Drive the change with `node:test`, first proving duplicated prefix blocks are
present in serialized output, then making the focused test pass. The test also
checks non-prefix ordering, distinct declarations, all Turtle-bearing fields,
and input immutability.

Focused proof:

```sh
node --test docs/inspector/test/book-store.test.mjs
```

Full gate:

```sh
./gate.sh
```

Commit: `fix(inspector): dedupe serialized book prefixes`

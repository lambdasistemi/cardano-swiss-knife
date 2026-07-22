# Plan: Port book parsing to PureScript

## Technical approach

Use one high-effort vertical RED-to-GREEN slice. First add characterization tests that demand a typed `BookInput` classifier and exact output parity for every retained path; observe the focused failure against the current one-line `Book.purs`. Then implement the parser and renderers in `Book.purs`, using PureScript JSON/object libraries declared directly by the library package. Keep `Book.js` only as the FFI source for the three build-time `globalThis` strings. Finally switch the browser compatibility module and Node bundling entry point to the generated PureScript module and rerun all focused and integration proofs.

The public PureScript surface will expose typed book/part/import records, a recognized-input sum type, pure parsing/classification and blueprint helpers, the three foreign constants, and a host adapter for an ordered array of JSON documents. The Node adapter may unwrap a typed `Either`, but its exported Node/CLI behavior and errors remain unchanged. Browser parsing remains an `Effect (Either String OverlayBook)` compatibility operation backed by the pure library result.

## Slice 1 — Port and integrate book parsing

1. RED: add PureScript characterization tests for the sum-type classifier, exact generated records/Turtle, FNV identifiers, blueprint arguments, store selection/order, and rejection text; extend packaged Node assertions where the host boundary needs proof.
2. GREEN: define the book, part, journal, blueprint, store, and recognized-input types and exhaustively decode/dispatch them in `Book.purs`.
3. GREEN: port every string, label, IRI, block, script-block, Amaru-part, hash, numeric, and blueprint helper with exact output parity.
4. GREEN: reduce `Book.js` to injected constants, replace the browser FFI re-export with a typed PureScript facade, and point Node at the compiled module.
5. VERIFY: run focused PureScript and Node checks, then `./gate.sh`; return one reviewed, bisect-safe commit.

## Owned files

- `lib/src/Cardano/Transaction/Book.purs`
- `lib/src/Cardano/Transaction/Book.js`
- `lib/spago.yaml`
- `test/src/Test/TransactionBook.purs` (new)
- `test/src/Test/Main.purs`
- `node/src/index.js`
- `node/test/transaction-books.test.mjs`
- `docs/inspector/src/FFI/OverlayBook.purs`
- `docs/inspector/src/FFI/OverlayBook.js` (delete when no foreign imports remain)
- `docs/inspector/tests/amaru-book.spec.mjs`
- `specs/102-book-purescript-port/tasks.md` only for orchestrator checkbox stamping after acceptance

## Risks and controls

- JavaScript coercion, object-key order, 32-bit FNV behavior, number rendering, whitespace, and final-newline details are pinned by exact golden strings before removal.
- The sum type separates recognized shapes from rendering so adding a future shape creates a compiler-visible dispatch obligation.
- Both browser and Node are switched in the same commit, preventing an intermediate host from losing book support.
- No new npm dependency is permitted; only registry-pinned PureScript packages already represented by `spago.lock` may be declared.
- The inherited Playwright gate can take 7-8 minutes; the ticket owner reruns it in a persistent terminal if a worker call times out.
- Fresh remote CI is required because local success alone does not prove the Nix/package/browser assembly paths.

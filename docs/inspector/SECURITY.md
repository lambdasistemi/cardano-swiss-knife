# Inspector Editor Security Note

The inspector uses CodeMirror for RDF and text editing in the browser workbench. It is an editing surface only: it is not used for signing, private key handling, wallet credential entry, credential storage, transaction submission, or funds custody.

CodeMirror is outside the signing and key trust path. Draft text from the editor is parsed into overlay-book data and can affect labels, SHACL views, and other workbench annotations, but it does not define Cardano ledger semantics. Ledger behavior remains behind the explicit JSON operation boundary and the WASM ledger implementation.

CodeMirror dependencies are exactly pinned in `docs/inspector/package.json` and mirrored in `docs/inspector/package-lock.json`. The standalone editor package under `packages/purescript-rdf-editor/` has matching explicit pins and remains isolated from inspector store, route, and book orchestration.

The tradeoff is supply-chain exposure for a richer local RDF/text editor. That tradeoff should be re-evaluated when CodeMirror is moved into any signing, key, credential, wallet, funds, transaction-submission, or ledger/WASM semantic path, or when dependency pinning/lockfile enforcement changes.

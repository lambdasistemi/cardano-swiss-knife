# Plan: engine pin catch-up

Update the inspector source declaration to track its default branch while
keeping the reproducible revision in `flake.lock`. Run a targeted Nix lock
update, verify the consumed WASM and protocol-registry outputs before and
after, and exercise the complete repository gate.

## Slice 1 — source pin and lock update

1. Remove the hard revision from the inspector input URL.
2. Update only `cardano-ledger-inspector` in the lock file.
3. Record the consumed artifact paths and run the extended full gate.

The inspector's current flake no longer declares several former inputs, so
their lock nodes and the obsolete `rdf-shapes-wasm` follow override are
removed as forced consequences of this single-node update.

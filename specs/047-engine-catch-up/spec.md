# Engine pin catch-up

## P1 user story

As a maintainer, I can build Cardano Swiss Knife with the current
cardano-ledger-inspector engine and receive the same engine artifacts that
the engine repository publishes.

## Requirements

- The inspector input URL is revision-less; `flake.lock` is the only source
  of its resolved supply-chain revision.
- The lock resolves inspector main at or after `cef54e0`.
- The existing full gate remains green.
- The PR records before/after paths for `wasm-tx-inspector` and
  `protocol-registry`, and explains any forced lock-node removals.

## Success criteria

- `flake.lock` resolves inspector to `43843609d07be49818205d94e5ec137969510341`.
- Both recorded artifact paths are identical across the pin update.
- `./gate.sh` exits successfully at the final head.

# Issue 16 — Bootstrap the product repository

## P1 User Story

As a maintainer, I build the Cardano Swiss Knife main branch against the
current ledger-inspector flake pin with MIT licensing in place and receive a
green pre-transplant CI baseline.

## Functional Requirements

- FR-001: Include an MIT `LICENSE` with `Copyright (c) 2026 Lambda Sistemi`.
- FR-002: State the repository's MIT licensing in `README.md`.
- FR-003: Lock `cardano-ledger-inspector` to its current upstream `main`.
- FR-004: Keep transaction inspection and signing functional with the bumped
  inspector WASM, including the Transactions Playwright scenarios.

## Success Criteria

- `LICENSE` and the README license section agree on MIT licensing.
- `flake.lock` records the current `cardano-ledger-inspector` revision.
- `./gate.sh` passes, running `nix develop --quiet -c just ci`.
- The Transactions Playwright suite passes against the refreshed inspector WASM.

## Boundaries

No product features, shell refactors, release automation, or workbench
transplant work are included.

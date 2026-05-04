# Cardano Swiss Knife Constitution

## Core Principles

### I. One Operation Model, Multiple Hosts
Cardano Swiss Knife defines one shared operation model across browser and CLI hosts. Operation names, request envelopes, and response shapes must stay aligned so a workflow learned in the browser can be reproduced in the CLI without semantic drift.

### II. Browser-First, CLI-Parity-Conscious
The browser is the first delivery target, but CLI parity is a design constraint from day one. Browser-only shortcuts that block later CLI adoption are not acceptable; host-specific behavior must stay at the edges.

### III. Authoritative Cardano Engines
Cryptography, address logic, transaction decoding, and ledger semantics must come from authoritative Cardano implementations compiled to WASM or linked natively. Reimplementing ledger-sensitive behavior in ad hoc JavaScript is a last resort and requires explicit justification.

### IV. Local-First Secret Handling
Recovery phrases, signing keys, and transaction witness material stay local to the host unless the user explicitly opts into an external provider or hardware path. Provider integrations are fetchers and submitters, not secret custodians.

### V. Honest Capability Boundaries
The product must distinguish clearly between inspection, detached witness production, transaction mutation, validation, evaluation, submission, and hardware-wallet flows. The UI and docs must not imply full transaction signing when only body-hash signing or witness-material export exists.

## Product Constraints

- The product scope is “Cardano Swiss Knife”: address tools, transaction inspection, witness planning, detached signing, and adjacent workflows that compose cleanly.
- Browser and CLI hosts should be thin orchestration layers over shared operation contracts and reusable Cardano engines.
- Static hosting and offline-friendly browser behavior are preferred defaults for the web host.
- Nix is the canonical build surface. `just` and npm scripts should wrap, not replace, the reproducible build path.

## Development Workflow

- Every user-visible capability should land as a vertical slice: UI, wiring, engine integration, and verification together.
- PR-first workflow starts as soon as the repository has a bootstrap `main`; every follow-on change should be reviewable through GitHub PRs.
- New WASM artifacts, provider boundaries, and operation contracts must be documented in README and reflected in the browser shell before being considered done.
- Quality gates must cover formatting, PureScript build, Haskell quality where relevant, and browser verification for the shipped workbench.

## Governance

This constitution overrides local convenience. When a proposed change conflicts with these principles, the implementation or the scope must change, not the wording. Amendments require updating this document and the surrounding repo guidance in the same change.

**Version**: 1.0.0 | **Ratified**: 2026-05-04 | **Last Amended**: 2026-05-04

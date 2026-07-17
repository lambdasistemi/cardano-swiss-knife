# Implementation plan — issue #44

## Context

`Shell.purs` owns the header and footer markup. `tx-identify.spec.mjs` contains
the two existing header-brand assertions. The repository's Nix-only gate
already executes the full inspector Playwright suite.

## Slice 1 — product name, footer provenance, and browser proof

1. Update `Shell.purs` to use the product name and expose Source, Engine, and
   existing Docs destinations with the accepted URLs.
2. Replace each exact old-brand Playwright assertion and add footer link proof
   in the existing shell/root coverage.
3. Extend `gate.sh` with a static branding inventory, then run the focused
   browser proof and the complete gate.

This is one vertical, bisect-safe commit because the rendered copy, its browser
proof, and the guardrail describe one user-visible branding change.

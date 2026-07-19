# Tasks: Address-first decoded-tree labeling

**Input**: `specs/061-address-label-view/spec.md` and
`specs/061-address-label-view/plan.md`

## Slice 1 — Address display/edit path and browser proof (P1)

**Goal**: Make the reusable Cardano address the first-class identity in the
decoded-tree labeling journey while preserving the existing raw or credential
identity as secondary evidence.

**Independent Test**: Decode the known-address fixture, label an Address row,
and verify address display/edit context, secondary identity, saved
`cardano:bech32` Turtle, immediate resolution, export, and clean-context reload.

- [ ] T611 [US1] Add failing address-first display/edit assertions to the known-address annotation journey in `docs/inspector/tests/tx-identify.spec.mjs`.
- [ ] T612 [US1] Render the reusable address as primary identity and preserve the raw/credential identity in `docs/inspector/src/Main.purs`.
- [ ] T613 [US1] Complete browser proof for address-bound save, immediate resolution, export, and reload in `docs/inspector/tests/tx-identify.spec.mjs`.
- [ ] T614 [US1] Run `nix run .#ci-inspector-playwright` and `./gate.sh`, then commit the bisect-safe slice with the required task trailer.

## Dependencies & Execution Order

- T611 establishes RED before T612 changes production behavior.
- T612 flips the focused browser proof to GREEN.
- T613 closes the full reusable-address journey without changing sibling-owned
  serialization behavior.
- T614 follows navigator approval of the full GREEN diff.
- The four tasks form one commit; none is independently shippable.

## Owned Files

- `docs/inspector/src/Main.purs`
- `docs/inspector/tests/tx-identify.spec.mjs`

## Commit Contract

```text
fix(inspector): show address identity when labeling

Tasks: T611, T612, T613, T614
```

The driver does not edit this task file. After independent review and gate
verification, the ticket-orchestrator checks all four boxes and amends them
into the reviewed implementation commit before push.

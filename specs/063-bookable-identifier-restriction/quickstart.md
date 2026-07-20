# Verification quickstart: Bookable decoded-tree identifiers

## Shared policy RED/GREEN

```bash
nix develop --quiet -c spago test -p cardano-addresses-test
```

RED must fail because the policy module/function is missing or returns the
wrong classification. GREEN must report the shared suite passing.

## WebUI RED/GREEN

```bash
nix run .#ci-inspector-playwright
```

RED must fail because non-bookable rows still expose `Label this node`.
GREEN must pass the inspector journeys with address and verification-key
labeling preserved.

## Final repository proof

```bash
./gate.sh
```

Success means every inventory, build, unit, inspector, UX, documentation, and
outer Playwright command exits zero.

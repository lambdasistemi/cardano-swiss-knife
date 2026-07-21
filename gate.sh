#!/usr/bin/env bash
set -euo pipefail

git diff --check
git diff --check origin/main...HEAD
bash scripts/check-architecture-boundary.sh
nix run .#ci-check
nix run .#ci-build
nix run .#ci-test
nix run .#ci-playwright
if [[ -f docs/inspector/test/entry-store.test.mjs ]]; then
  nix develop --quiet -c node --test docs/inspector/test/entry-store.test.mjs
fi

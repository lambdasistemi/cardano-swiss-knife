#!/usr/bin/env bash
set -euo pipefail

git diff --check
git diff --check origin/main...HEAD
bash scripts/check-architecture-boundary.sh
nix run .#ci-node-api
just release-gates
nix build .#checks.x86_64-linux.test --no-link
nix run .#ci-check
nix run .#ci-haskell-quality
nix run .#ci-check-vectors
nix run .#ci-build
nix run .#ci-test
nix run .#ci-playwright

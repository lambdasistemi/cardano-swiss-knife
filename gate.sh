#!/usr/bin/env bash
set -euo pipefail

git diff --check
nix build .#checks.x86_64-linux.test --no-link
nix run .#ci-check
nix run .#ci-haskell-quality
nix run .#ci-check-vectors
nix run .#ci-build
nix build .#tx-inspector-ui --no-link
nix run .#ci-inspector-playwright
nix develop github:paolino/dev-assets?dir=mkdocs --quiet -c mkdocs build --strict
nix run .#ci-test
nix run .#ci-playwright

#!/usr/bin/env bash
set -euo pipefail

git diff --check
nix run .#ci-node-api
if [[ -f typedoc.json ]]; then
  nix develop --quiet -c just build-api-docs
  test -f docs/api/index.md
fi
nix develop github:paolino/dev-assets?dir=mkdocs --quiet -c mkdocs build --strict

#!/usr/bin/env bash
set -euo pipefail

git diff --check
nix run .#ci-node-api
nix develop github:paolino/dev-assets?dir=mkdocs --quiet -c mkdocs build --strict

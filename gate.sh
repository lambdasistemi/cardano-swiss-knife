#!/usr/bin/env bash
set -euo pipefail

git diff --check
git diff --check origin/main...HEAD
nix run .#ci-node-api
nix run .#ci-node-package
nix develop --quiet -c just ci

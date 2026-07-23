#!/usr/bin/env bash
set -euo pipefail

git diff --check
git diff --check origin/main...HEAD
nix run .#ci-vault
nix run .#ci-vault-cli
nix run .#ci-node-api
nix develop --quiet -c just ci

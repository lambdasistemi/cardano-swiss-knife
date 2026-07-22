#!/usr/bin/env bash
set -euo pipefail

git diff --check
git diff --check origin/main...HEAD
nix develop -c spago build
nix run .#ci-test
nix run .#ci-node-api
nix run .#ci-inspector-playwright

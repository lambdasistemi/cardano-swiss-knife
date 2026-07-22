#!/usr/bin/env bash
set -euo pipefail

git diff --check
git diff --check origin/main...HEAD
nix develop -c spago build
nix run .#ci-inspector-playwright

#!/usr/bin/env bash
set -euo pipefail

git diff --check
git diff --check origin/main...HEAD
bash scripts/check-architecture-boundary.sh
nix run .#ci-test

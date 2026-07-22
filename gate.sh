#!/usr/bin/env bash
set -euo pipefail

git diff --check
git diff --check origin/main...HEAD
nix run .#ci-inspector-playwright

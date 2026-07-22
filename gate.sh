#!/usr/bin/env bash
set -euo pipefail

git diff --check
git diff --check origin/main...HEAD

lock_snapshot="$(mktemp)"
cp spago.lock "$lock_snapshot"
restore_root_lock() {
  cp "$lock_snapshot" spago.lock
  rm -f "$lock_snapshot"
}
trap restore_root_lock EXIT
nix develop -c spago build
restore_root_lock
trap - EXIT

nix run .#ci-test
nix run .#ci-node-api
nix run .#ci-inspector-playwright

#!/usr/bin/env bash
# Mechanical gate for csk#129 — publish-on-tag jobs fail at check-release-version.
#
# Scope of proof for this ticket:
#   1. `csk --version` / `csk -V` must resolve on a PRISTINE checkout (no
#      node_modules, no PureScript output/ tree) — the two publish-job
#      environments at a tag ref.
#   2. Nothing about the CLI's real behaviour may regress while achieving (1):
#      offline commands, tx commands, and the vault flows all still work from
#      both the source entrypoint and the esbuild-bundled package.
#   3. The release-workflow ordering guard (check-release-version before any
#      external publish/upload step) must still hold.
set -euo pipefail

git diff --check

# CLI + Node API behaviour, source entrypoint and bundled package.
nix run .#ci-node-api

# Vault CLI end-to-end (age-encryption path — the import that broke the probe).
nix run .#ci-vault-cli

# Version contract, incl. the pristine-checkout regression coverage.
nix develop --quiet -c just release-version

# Packaged tarball/bundle manifest contract.
nix develop --quiet -c just release-package

# Publish-workflow structure and step ordering.
nix develop --quiet -c just release-workflows

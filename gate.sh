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

# `.#ci-vault-cli` is NOT hermetic: it is a bare `node --test` app that runs in
# the CURRENT worktree, so it needs an up-to-date node_modules AND a compiled
# PureScript output/ tree. Neither is guaranteed in a fresh worktree, and no CI
# job runs this app, so it has no maintained baseline. Measured 2026-07-29:
# a stale node_modules fails it at `age-encryption` import, and a missing
# output/ fails it at vault-cli.test.mjs:483 (tx validate returns exit 4
# instead of the structured ENGINE_NOT_FOUND exit 5) — both environment, not
# code. Assert the environment explicitly so the step measures the diff and
# nothing else.
#
# Do NOT run `npm ci` here: the dev shell's shellHook symlinks node_modules to a
# read-only Nix store path, so npm cannot unlink anything inside it (EACCES).
# And `nix develop -c` does not run shellHook, so the gate cannot create the
# link itself — it asserts the precondition and says how to satisfy it.
if [ ! -e node_modules ] && [ ! -L node_modules ]; then
  echo "gate: node_modules is absent. Run 'nix develop' once in this worktree so" >&2
  echo "      its shellHook links the Nix-built node_modules, then re-run ./gate.sh." >&2
  exit 1
fi

# A stale REAL node_modules directory (one predating a dependency bump) passes
# the check above and then fails deep inside the suite with a confusing
# ERR_MODULE_NOT_FOUND. That is exactly how the /code/cardano-swiss-knife main
# worktree behaves today. Name the problem here instead.
for dep in $(nix develop --quiet -c node -p \
  'Object.keys(require("./package.json").dependencies||{}).join(" ")'); do
  [ -e "node_modules/$dep" ] || {
    echo "gate: node_modules is stale — '$dep' is declared in package.json but absent." >&2
    echo "      Remove node_modules and run 'nix develop' once to relink it." >&2
    exit 1
  }
done

# The PureScript output/ tree, which the non-hermetic vault-cli app imports.
nix develop --quiet -c npx spago build -p cardano-addresses

# Vault CLI end-to-end. Kept despite the cost because it is the only coverage of
# the interactive `vault create|list|migrate|credential add` flows, which run
# through `parse()` — the one place a deferred vault-host import could change an
# exit code or turn a throw into an unhandled rejection.
nix run .#ci-vault-cli

# Version contract, incl. the pristine-checkout regression coverage.
nix develop --quiet -c just release-version

# Packaged tarball/bundle manifest contract.
nix develop --quiet -c just release-package

# Publish-workflow structure and step ordering.
nix develop --quiet -c just release-workflows

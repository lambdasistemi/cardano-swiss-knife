#!/usr/bin/env bash
# Mechanical gate for csk#138 — provenance rejects publication (no repository
# field), and nothing rehearses the real registry.
#
# Scope of proof:
#   1. package.json declares a repository whose url matches this repo.
#   2. A release check FAILS when that field is missing or mismatched, and is
#      demonstrated able to fail on a seeded control.
#   3. The workflow-structure contract still holds, including whatever shape
#      the rehearsal job takes.
#   4. Package/version release contracts do not regress — package.json is
#      touched, so the manifest and version suites must both run.
set -euo pipefail

git diff --check

# Version + package contracts (package.json is edited by this ticket).
nix develop --quiet -c just release-version
nix develop --quiet -c just release-package

# Workflow structure, step ordering, and the publish-argument guard from #134,
# plus whatever the rehearsal job adds.
nix develop --quiet -c just release-workflows

# Manifest/parity contracts that also read package.json.
nix develop --quiet -c just release-gates

# Slice B edits docs/dev/releasing.md, which is under a machine contract:
# check-release-docs.mjs requires the release-operation section to name
# "release-please" and "npm publish". That contract is enforced by
# `just release-docs`, which lives in `just ci` but was NOT in this gate — so a
# docs regression would have passed ./gate.sh and failed in CI after push.
# That is this ticket chain's own failure mode (a check that does not run where
# it matters), so it is closed here rather than accepted.
nix develop --quiet -c just release-docs

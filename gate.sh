#!/usr/bin/env bash
# Mechanical gate for csk#134 — npm publish never runs: the tarball path is
# parsed as a GitHub repo shorthand.
#
# Scope of proof:
#   1. The publish argument in release.yml is one npm resolves as a FILE PATH,
#      not as a package spec.
#   2. A static guard in scripts/check-release-workflows.mjs rejects a bare
#      `a/b` publish argument — and is demonstrated able to fail on a seeded
#      bad workflow, not merely to pass on the good one.
#   3. Nothing else about the release-workflow contract regresses.
set -euo pipefail

git diff --check

# Workflow structure, step ordering, and the new publish-argument guard.
# Measured 2026-07-29: this recipe passes in a worktree with NO node_modules
# (it parses workflow YAML with Node built-ins), so unlike the csk#129 gate it
# needs no environment precondition. Do not add one speculatively — an
# assertion that cannot fail for a real reason only manufactures false blocks.
nix develop --quiet -c just release-workflows

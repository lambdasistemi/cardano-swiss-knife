#!/usr/bin/env bash
set -euo pipefail

# Mechanical gate for cardano-swiss-knife#122 (WebUI structured signer review).
#
# Inherited from the #121 lane VERBATIM below the header. That gate kept
# `just release-gates` / `just release-docs` because two release-pin drift
# classes had previously reached remote CI undetected — and on #121 that
# decision paid off again: the engine manifest and docs still pinned the
# pre-#168 inspector revision after flake.lock moved, and this gate caught
# it. Kept here for the same reason.
#
# What matters MORE for this ticket: this is the first lane to change the
# Halogen workbench, so a BROWSER proof is load-bearing — a PureScript
# renderer can typecheck, pass purs-tidy and still render nothing.
#
# CAREFUL: there are two Playwright suites and they test different apps.
#   ci-playwright            -> tests/*.spec.ts, the cardano-addresses web UI
#   ci-inspector-playwright  -> docs/inspector/tests/*.spec.mjs, THE WORKBENCH
# The inherited #121 gate ran only the former. For a workbench ticket that
# would pass without ever exercising what is being built, so this gate adds
# the inspector suite below.

commit_gate() {
  local sha="${1:?usage: commit_gate <sha>}"
  local subject body
  subject=$(git show -s --format=%s "$sha")
  body=$(git show -s --format=%b "$sha" | sed '/^[[:space:]]*$/d')

  case "$subject" in
    [Ww][Ii][Pp]*|draft*|Draft*|tmp*|Tmp*|temp*|Temp*|fixup!*|squash!*)
      echo "bad subject: $subject"; return 1 ;;
  esac

  printf '%s\n' "$subject" \
    | grep -Eq '^(feat|fix|docs|test|refactor|perf|build|ci|chore|style|revert)(\([^)]+\))?!?: .+' \
    || { echo "subject is not an approved Conventional Commit: $subject"; return 1; }

  [ -n "$body" ] || { echo "commit body is empty: $subject"; return 1; }

  # Behavior-changing commits carry a Tasks: trailer linking back to tasks.md.
  # The optional lowercase suffix (T007a) exists so an analyzer loop-back task
  # can be added mid-PR without a separate chore commit to widen this regex.
  case "$subject" in
    chore*|docs*|build*|ci*|style*|revert*) ;;
    *)
      printf '%s\n' "$body" \
        | grep -Eq '^Tasks:[[:space:]]*T[0-9]+[a-z]?([[:space:]]*,[[:space:]]*T[0-9]+[a-z]?)*[[:space:]]*$' \
        || { echo "commit body missing 'Tasks: T###[a-z][, T###[a-z]]' trailer: $subject"; return 1; }
      ;;
  esac
}

branch_commit_gate() {
  local base fail=0 sha
  git fetch --quiet origin main
  base=$(git merge-base origin/main HEAD)
  while read -r sha; do
    commit_gate "$sha" || fail=1
  done < <(git rev-list --reverse "$base..HEAD")
  [ "$fail" -eq 0 ] || { echo "FAIL: branch has commits that do not pass the message gate"; return 1; }
  echo "OK: every commit on this branch passes the message gate."
}

git diff --check
git diff --check origin/main...HEAD
branch_commit_gate
bash scripts/check-architecture-boundary.sh
nix run .#ci-node-api
just release-gates
just release-docs
nix build .#checks.x86_64-linux.test --no-link
nix run .#ci-check
nix run .#ci-haskell-quality
nix run .#ci-check-vectors
nix run .#ci-build
nix run .#ci-test
nix run .#ci-playwright
nix run .#ci-inspector-playwright

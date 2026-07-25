#!/usr/bin/env bash
set -euo pipefail

# Mechanical gate for cardano-swiss-knife#121 (structured signer-review renderer).
#
# Inherited verbatim from the #120 lane's FINAL gate — including `just
# release-gates` and `just release-docs`, which that lane added only after two
# separate release-pin drift classes reached remote CI undetected. They are kept
# here deliberately: this ticket is nominally CLI-only, but "assumed irrelevant"
# is exactly how those two escaped. The gate proves it rather than asserting it.

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

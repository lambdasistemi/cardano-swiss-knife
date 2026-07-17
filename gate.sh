#!/usr/bin/env bash
set -euo pipefail

legacy_secret_storage_inventory() {
  local source
  while IFS= read -r source; do
    [[ "$source" == "docs/inspector/src/Main.purs" ]] || {
      echo "legacy cleartext credential-storage key escaped its known migration boundary: $source" >&2
      return 1
    }
  done < <(
    rg -l 'blockfrost_project_id|koios_bearer_token|persist_api_keys' docs/inspector/src || true
  )
}

book_interchange_contract_inventory() {
  local contract="docs/book-interchange.md"
  local required

  [[ -f "$contract" ]] || {
    echo "missing book interchange contract: $contract" >&2
    return 1
  }

  for required in \
    'amaru.book.bundle.v1' \
    'urn:cardano:id:key:' \
    'urn:cardano:id:address:' \
    'urn:cardano:id:script:' \
    'overlay:Owner' \
    'overlay:Address' \
    'overlay:CardanoScript' \
    'cardano:bech32' \
    'named:wallets'; do
    rg -Fq "$required" "$contract" || {
      echo "book interchange contract missing required term: $required" >&2
      return 1
    }
  done
}

git diff --check
legacy_secret_storage_inventory
book_interchange_contract_inventory
nix build .#checks.x86_64-linux.test --no-link
nix run .#ci-check
nix run .#ci-haskell-quality
nix run .#ci-check-vectors
nix run .#ci-build
nix build .#tx-inspector-wasm --no-link
nix build .#tx-inspector-ui --no-link
nix run .#ci-inspector-playwright
nix run .#ci-ux-capture
nix run .#ci-combined-site-smoke
nix develop github:paolino/dev-assets?dir=mkdocs --quiet -c mkdocs build --strict
nix run .#ci-test
nix run .#ci-playwright

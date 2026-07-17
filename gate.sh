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

rendered_resolution_journey_inventory() {
  local fixture="docs/inspector/tests/fixtures/treasury-reorganize-unsigned-tx.hex"
  local journey="docs/inspector/tests/tx-identify.spec.mjs"
  local expected_sha="11ba0b62566367e6dfd76eb6d06e4dc6474cf145d434b596d047377b69d1fb75"
  local fixture_sha required

  [[ -f "$fixture" ]] || {
    echo "missing rendered-resolution treasury fixture: $fixture" >&2
    return 1
  }
  fixture_sha="$(sha256sum "$fixture")"
  fixture_sha="${fixture_sha%% *}"
  [[ "$fixture_sha" == "$expected_sha" ]] || {
    echo "rendered-resolution treasury fixture SHA mismatch: expected $expected_sha, got $fixture_sha" >&2
    return 1
  }

  [[ -f "$journey" ]] || {
    echo "missing rendered-resolution browser journey: $journey" >&2
    return 1
  }
  for required in \
    'renders exact Amaru book resolutions across Structure and Witness' \
    'attx-book-bundle.json' \
    '.decoded-resolution-disclosure' \
    '.decoded-resolution-entry' \
    'network_compliance scope owner' \
    'operator fuel wallet' \
    'Missing declared signers' \
    'treasuryOutputAddressHex' \
    'navigator.clipboard.readText()'; do
    rg -Fq "$required" "$journey" || {
      echo "rendered-resolution browser journey missing proof anchor: $required" >&2
      return 1
    }
  done

  if rg -q '(^|[^A-Za-z])(test|describe)\.only\(' "$journey"; then
    echo "rendered-resolution browser journey must not remain focused-only" >&2
    return 1
  fi
}

git diff --check
legacy_secret_storage_inventory
book_interchange_contract_inventory
rendered_resolution_journey_inventory
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

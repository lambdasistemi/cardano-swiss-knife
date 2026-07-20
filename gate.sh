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
    'treasuryReorganizeFixturePath' \
    'treasuryOwnerHash' \
    '"required_signers"' \
    '"ttl"' \
    '"withdrawals"' \
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

provider_validation_truth_inventory() {
  local journey="docs/inspector/tests/tx-identify.spec.mjs"
  local required

  [[ -f "$journey" ]] || {
    echo "missing provider-validation truth journey: $journey" >&2
    return 1
  }

  for required in \
    'keeps Blockfrost decode inside the selected provider and surfaces missing credentials' \
    'Validation context unavailable' \
    'Blockfrost credentials not supplied' \
    'Validation incomplete' \
    'expect(koiosRequests).toBe(0)' \
    'hasText: "Validation passed"'; do
    rg -Fq "$required" "$journey" || {
      echo "provider-validation truth journey missing proof anchor: $required" >&2
      return 1
    }
  done

  if rg -q '(^|[^A-Za-z])(test|describe)\.only\(' "$journey"; then
    echo "provider-validation truth journey must not remain focused-only" >&2
    return 1
  fi
}

product_branding_inventory() {
  local shell="docs/inspector/src/Shell.purs"
  local journey="docs/inspector/tests/tx-identify.spec.mjs"
  local required

  for required in \
    'Cardano Swiss Knife' \
    'https://github.com/lambdasistemi/cardano-swiss-knife' \
    'https://github.com/lambdasistemi/cardano-ledger-inspector'; do
    rg -Fq "$required" "$shell" || {
      echo "product branding is missing required text or link: $required" >&2
      return 1
    }
  done

  if rg -Fq 'Ledger Inspector' "$shell"; then
    echo "legacy product brand remains in the site shell" >&2
    return 1
  fi

  rg -Fq 'Cardano Swiss Knife' "$journey" || {
    echo "Playwright branding assertion is missing" >&2
    return 1
  }
}

address_label_view_inventory() {
  local ui="docs/inspector/src/Main.purs"
  local journey="docs/inspector/tests/tx-identify.spec.mjs"
  local required

  for required in \
    'renderDecodedTreeAnnotationAction' \
    'decodedRowHasAddressIdentity' \
    'row.annotationPredicate == "cardano:bech32"' \
    'row.annotationValue' \
    'decoded-tree-address-value' \
    'Copy address' \
    'decoded-tree-raw-value' \
    'Copy raw value' \
    'decoded-tree-annotation-target' \
    'Address to label' \
    'Label this node'; do
    rg -Fq "$required" "$ui" || {
      echo "decoded-tree address-label view missing UI anchor: $required" >&2
      return 1
    }
  done

  for required in \
    'resolves decoded-tree address rows from selected Turtle overlay books' \
    'labels decoded-tree nodes into local books and resolves immediately' \
    'cardano:bech32' \
    'cardano:bech32 "${addressBech32}"' \
    'decodedRowRawText(addressRow)' \
    'decoded-tree-address-value' \
    'decoded-tree-annotation-target' \
    'Address to label' \
    'Copy address' \
    'Copy raw value' \
    'Label this node'; do
    rg -Fq "$required" "$journey" || {
      echo "decoded-tree address-label view missing browser anchor: $required" >&2
      return 1
    }
  done
}

bookable_identifier_restriction_inventory() {
  local policy="lib/src/Cardano/BookableIdentifier.purs"
  local policy_test="test/src/Test/BookableIdentifier.purs"
  local test_main="test/src/Test/Main.purs"
  local ui="docs/inspector/src/Main.purs"
  local journey="docs/inspector/tests/tx-identify.spec.mjs"
  local required

  for required in \
    'module Cardano.BookableIdentifier (isBookableIdentifierKind) where' \
    'isBookableIdentifierKind :: String -> Boolean' \
    '"address" -> true' \
    '"key" -> true' \
    '"script" -> true' \
    '"script_hash" -> true' \
    '_ -> false'; do
    rg -Fq "$required" "$policy" || {
      echo "bookable identifier policy missing proof anchor: $required" >&2
      return 1
    }
  done

  for required in \
    'module Test.BookableIdentifier (runBookableIdentifierTests) where' \
    'traverse_ assertBookable [ "address", "key", "script", "script_hash" ]' \
    'traverse_ assertNotBookable [ "", "unknown", "hash", "tx-out-ref", "output", "integer", "raw-bytes" ]'; do
    rg -Fq "$required" "$policy_test" || {
      echo "bookable identifier direct test missing proof anchor: $required" >&2
      return 1
    }
  done

  for required in \
    'import Test.BookableIdentifier (runBookableIdentifierTests)' \
    'runBookableIdentifierTests'; do
    rg -Fq "$required" "$test_main" || {
      echo "bookable identifier direct test is not wired into Test.Main: $required" >&2
      return 1
    }
  done

  for required in \
    'import Cardano.BookableIdentifier (isBookableIdentifierKind)' \
    'if isBookableIdentifierKind row.kind && row.resolvedLabel == "" && row.annotationPredicate /= "" && row.annotationValue /= "" then'; do
    rg -Fq "$required" "$ui" || {
      echo "bookable identifier policy missing WebUI consumption anchor: $required" >&2
      return 1
    }
  done

  for required in \
    'for (const label of ["auxiliary_data_hash", "script_data_hash"])' \
    'const nonBookableRows = [' \
    '"transaction_hash"' \
    '"Input 0"' \
    '"Output 0"' \
    '"Datum hash"' \
    '"Datum raw bytes"' \
    'decodedTreeAnnotationActionLayout(firstAddressRow)' \
    'getByRole("radio", { name: "Create new local book" }).check()' \
    'decodedTreeAnnotationActionLayout(verificationKeyRow)' \
    'getByRole("radio", { name: "Append to existing book" }).check()'; do
    rg -Fq "$required" "$journey" || {
      echo "bookable identifier browser regression missing proof anchor: $required" >&2
      return 1
    }
  done
}

git diff --check
git diff --check origin/main...HEAD
legacy_secret_storage_inventory
book_interchange_contract_inventory
rendered_resolution_journey_inventory
provider_validation_truth_inventory
product_branding_inventory
address_label_view_inventory
bookable_identifier_restriction_inventory
bash scripts/check-architecture-boundary.sh
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

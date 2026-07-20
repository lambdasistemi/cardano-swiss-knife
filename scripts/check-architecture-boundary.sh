#!/usr/bin/env bash
set -euo pipefail

repo_root="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"

fail() {
  echo "architecture boundary: $*" >&2
  exit 1
}

require_file() {
  [[ -f "$1" ]] || fail "missing required file: ${1#"$repo_root"/}"
}

check_provider_policy() {
  local root="$1"
  local canonical="$root/lib/src/Cardano/Provider.purs"
  local source match
  local -a policy_markers=(
    'blockfrost[^"]*api/v0'
    'koios\.rest/api/v1'
    '"project_id"'
    'Authorization'
    '_tx_hashes'
  )

  require_file "$canonical"
  for source in "${policy_markers[@]}"; do
    rg -q "$source" "$canonical" || fail "shared provider policy is incomplete in lib/src/Cardano/Provider.purs: missing $source"
  done

  while IFS= read -r match; do
    [[ "$match" == "$canonical" ]] || fail "provider endpoint/auth/request policy must live only in lib/src/Cardano/Provider.purs (found in ${match#"$root"/})"
  done < <(
    find "$root/lib/src" "$root/docs/inspector/src" -type f \( -name '*.purs' -o -name '*.js' \) -print0 \
      | xargs -0 -r rg -l -e 'blockfrost[^"]*api/v0' -e 'koios\.rest/api/v1' -e '"project_id"' -e 'Authorization' -e '_tx_hashes' \
      | sort -u
  )
}

check_compatibility_adapters() {
  local root="$1"
  local adapter
  local -a adapters=(
    "$root/docs/inspector/src/Provider.purs"
    "$root/docs/inspector/src/FFI/Blockfrost.purs"
  )
  local -a deleted=(
    "$root/docs/inspector/src/Provider.js"
    "$root/docs/inspector/src/FFI/Blockfrost.js"
    "$root/docs/inspector/src/FFI/Koios.purs"
    "$root/docs/inspector/src/FFI/Koios.js"
  )

  for adapter in "${adapters[@]}"; do
    require_file "$adapter"
    if rg -n -e 'https?://' -e 'fetch\(' -e 'project_id' -e 'Authorization' -e '_tx_hashes' "$adapter"; then
      fail "WebUI compatibility adapter must delegate and contain no HTTP implementation: ${adapter#"$root"/}"
    fi
  done

  for adapter in "${deleted[@]}"; do
    [[ ! -e "$adapter" ]] || fail "deleted WebUI provider implementation was resurrected: ${adapter#"$root"/}"
  done
}

check_semantic_dependencies() {
  local root="$1"
  local forbidden='cardano-serialization-lib|cardano-multiplatform-lib|cardano-serialization|cbor-x|\bcborg\b|@rdfjs|rdf-ext|\bn3\b|sparqljs|sparql-engine|shacl-engine|shacl-js|semantic-fallback'
  local -a manifests=(
    "$root/package.json"
    "$root/docs/inspector/package.json"
    "$root/spago.yaml"
    "$root/lib/spago.yaml"
    "$root/test/spago.yaml"
    "$root/docs/inspector/spago.yaml"
    "$root/packages/purescript-rdf-editor/package.json"
    "$root/packages/purescript-rdf-editor/spago.yaml"
  )
  local manifest

  for manifest in "${manifests[@]}"; do
    require_file "$manifest"
    if rg -n -i "$forbidden" "$manifest"; then
      fail "host/shared manifest dependency substitutes authoritative Cardano/CBOR/RDF/SPARQL/SHACL semantics or adds fallback: ${manifest#"$root"/}"
    fi
  done

  if rg -n -i --glob '*.{purs,js}' 'import .*('"$forbidden"')' "$root/lib/src" "$root/docs/inspector/src"; then
    fail "host/shared import substitutes authoritative Cardano/CBOR/RDF/SPARQL/SHACL semantics or adds fallback"
  fi
}

check_documentation_anchors() {
  local root="$1"
  local architecture="$root/docs/architecture/system.md"
  local anchor
  local -a anchors=(
    'architecture-boundary: responsibility-table'
    'architecture-boundary: artifact-provenance-pins'
    'architecture-boundary: fail-hard-behavior'
    'architecture-boundary: provider-extension-process'
  )

  require_file "$architecture"
  for anchor in "${anchors[@]}"; do
    rg -Fq "$anchor" "$architecture" || fail "architecture documentation missing required anchor: $anchor"
  done
}

check_tree() {
  check_provider_policy "$1"
  check_compatibility_adapters "$1"
  check_semantic_dependencies "$1"
  check_documentation_anchors "$1"
}

run_negative_self_tests() {
  local fixture_root duplicate_output dependency_output
  fixture_root="$(mktemp -d "${TMPDIR:-/tmp}/csk-architecture-boundary.XXXXXX")"
  trap 'rm -rf -- "$fixture_root"' RETURN

  mkdir -p "$fixture_root/docs/architecture" "$fixture_root/docs/inspector"
  cp -R "$repo_root/lib" "$fixture_root/lib"
  cp -R "$repo_root/docs/inspector/src" "$fixture_root/docs/inspector/src"
  cp "$repo_root/docs/architecture/system.md" "$fixture_root/docs/architecture/system.md"
  cp "$repo_root/package.json" "$fixture_root/package.json"
  cp "$repo_root/spago.yaml" "$fixture_root/spago.yaml"
  cp "$repo_root/lib/spago.yaml" "$fixture_root/lib/spago.yaml"
  cp "$repo_root/test/spago.yaml" "$fixture_root/test-spago.yaml"
  cp "$repo_root/docs/inspector/package.json" "$fixture_root/docs/inspector/package.json"
  cp "$repo_root/docs/inspector/spago.yaml" "$fixture_root/docs/inspector/spago.yaml"
  mkdir -p "$fixture_root/packages/purescript-rdf-editor"
  cp "$repo_root/packages/purescript-rdf-editor/package.json" "$fixture_root/packages/purescript-rdf-editor/package.json"
  cp "$repo_root/packages/purescript-rdf-editor/spago.yaml" "$fixture_root/packages/purescript-rdf-editor/spago.yaml"
  mkdir -p "$fixture_root/test"
  mv "$fixture_root/test-spago.yaml" "$fixture_root/test/spago.yaml"

  mkdir -p "$fixture_root/lib/src/Cardano/Injected"
  printf '%s\n' 'duplicate = "https://api.koios.rest/api/v1/tx_cbor"' > "$fixture_root/lib/src/Cardano/Injected/Provider.purs"
  if duplicate_output="$(check_tree "$fixture_root" 2>&1)"; then
    fail "negative fixture unexpectedly accepted duplicate provider implementation"
  fi
  [[ "$duplicate_output" == *'provider endpoint/auth/request policy must live only'* ]] ||
    fail "negative fixture emitted the wrong duplicate-provider diagnostic: $duplicate_output"
  rm "$fixture_root/lib/src/Cardano/Injected/Provider.purs"

  printf '%s\n' '    "cbor-x": "fixture-only"' >> "$fixture_root/package.json"
  if dependency_output="$(check_tree "$fixture_root" 2>&1)"; then
    fail "negative fixture unexpectedly accepted forbidden semantic dependency"
  fi
  [[ "$dependency_output" == *'host/shared manifest dependency substitutes authoritative'* ]] ||
    fail "negative fixture emitted the wrong semantic-dependency diagnostic: $dependency_output"

  echo "architecture boundary: negative fixture rejected duplicate provider implementation"
  echo "architecture boundary: negative fixture rejected forbidden semantic dependency"
}

check_tree "$repo_root"
run_negative_self_tests
echo "architecture boundary: provider ownership, compatibility adapters, semantic dependencies, and documentation anchors verified"

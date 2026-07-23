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

check_host_ownership() {
  local root="$1"
  local host="$root/cli" node="$root/node/src"
  local provider='blockfrost[^" ]*api/v0|koios\.rest/api/v1|"project_id"|Authorization|_tx_hashes'
  local semantics='cardano-serialization|cbor-x|\bcborg\b|@rdfjs|rdf-ext|\bn3\b|sparqljs|sparql-engine|shacl-engine|shacl-js|semantic-fallback|\bplutus\b|blake2b|ed25519'
  if rg -n -i -e "$provider" "$host" "$node"; then fail "CLI/Node host must delegate provider endpoints, authentication, and decoders to Cardano.Provider"; fi
  if rg -n -i -e "$semantics" "$host" "$node"; then fail "CLI/Node host must not own Cardano/CBOR/RDF/SPARQL/SHACL semantics or fallbacks"; fi
}

check_transaction_host_delegation() {
  local root="$1"
  local host="$root/cli" commands="$root/node/src/commands"
  if rg -n -e 'runTransactionOperation\(' -e 'wasm-tx-inspector' -e 'TransactionLedger\.' "$host" "$commands"; then
    fail "CLI transaction routes must delegate through node/src/commands/tx.js and must not invoke ledger engines directly"
  fi
}

# Direct engine/protocol bypass: only the two designated engine wrappers
# (node/src/transaction-engine.js for the ledger inspector and
# node/src/rdf-engine.js for the RDF engine) may read, compile, or instantiate a
# WASM engine or import the WASI shim. Any other CLI or Node host file that
# touches a .wasm artifact, WebAssembly.compile/instantiate, or the WASI shim is
# a direct engine bypass and must be rejected.
check_direct_engine_bypass() {
  local root="$1"
  local host="$root/cli" node="$root/node/src"
  local -a allowed=(
    "$root/node/src/transaction-engine.js"
    "$root/node/src/rdf-engine.js"
  )
  local match
  while IFS= read -r match; do
    local skip=0 allowed_file
    for allowed_file in "${allowed[@]}"; do
      [[ "$match" == "$allowed_file" ]] && skip=1 && break
    done
    [[ "$skip" == "1" ]] && continue
    fail "CLI/Node host must not bypass the shared engine wrappers with a direct engine/protocol dependency: ${match#"$root"/}"
  done < <(
    find "$host" "$node" -type f \( -name '*.js' -o -name '*.mjs' \) -print0 \
      | xargs -0 -r rg -l -e 'WebAssembly\.(compile|instantiate)' -e 'browser_wasi_shim' -e '\.wasm' \
      | sort -u
  )
}

# Silent-fallback behavior: a host must never turn an engine/provider failure
# into a semantic success. This is deliberately a behavior-shaped scan, not a
# prose-marker ban: it rejects a try/catch around an engine/provider operation
# whose catch returns `{ ok: true, value: ... }`, while cleanup-only catches and
# catch/rethrow handling remain valid.
check_silent_fallback() {
  local root="$1"
  local -a surfaces=(
    "$root/cli"
    "$root/node/src/commands"
  )
  local surface
  for surface in "${surfaces[@]}"; do
    if rg -n -U -i -P 'try\s*\{[^{}]*\b(?:await\s+)?(?:[[:alnum:]_$.]*(?:engine|provider)[[:alnum:]_$.]*|runTransactionOperation|runLedgerOperation|resolveRdf)\s*\([^{};]*\)[^{}]*\}\s*catch\s*(?:\([^)]*\))?\s*\{[^{}]*\breturn\s+\{\s*ok\s*:\s*true\b' "$surface"; then
      fail "CLI/Node host must fail hard after an engine/provider failure; silent fallback must not return a semantic success/value: ${surface#"$root"/}"
    fi
  done
}

check_local_provider_context_boundary() {
  local root="$1"
  local cli="$root/cli/csk.mjs" node="$root/node/src/index.js" webui="$root/docs/inspector/src/Provider.purs"
  require_file "$cli"
  require_file "$node"
  require_file "$webui"
  rg -q 'Provider\.resolveProducerTxContext' "$node" ||
    fail "Node transaction input must resolve explicit local provider context through Cardano.Provider"
  rg -q 'Shared\.resolveProducerTxContext' "$webui" ||
    fail "WebUI provider compatibility adapter must delegate to the shared provider-context resolver"
  if rg -n -e 'resolveProducerTxContext' -e 'fetch\(' "$cli"; then
    fail "CLI local provider context must remain a thin Node API adapter"
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
  check_host_ownership "$1"
  check_transaction_host_delegation "$1"
  check_direct_engine_bypass "$1"
  check_silent_fallback "$1"
  check_local_provider_context_boundary "$1"
  check_documentation_anchors "$1"
}

run_negative_self_tests() {
  local fixture_root duplicate_output dependency_output
  fixture_root="$(mktemp -d "${TMPDIR:-/tmp}/csk-architecture-boundary.XXXXXX")"
  trap 'rm -rf -- "$fixture_root"' RETURN

  mkdir -p "$fixture_root/docs/architecture" "$fixture_root/docs/inspector" "$fixture_root/cli" "$fixture_root/node/src/commands"
  cp -R "$repo_root/lib" "$fixture_root/lib"
  cp -R "$repo_root/docs/inspector/src" "$fixture_root/docs/inspector/src"
  cp "$repo_root/cli/csk.mjs" "$fixture_root/cli/csk.mjs"
  cp "$repo_root/node/src/index.js" "$fixture_root/node/src/index.js"
  chmod -R u+w "$fixture_root/lib" "$fixture_root/docs/inspector/src"
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
  chmod -R u+w "$fixture_root"

  mkdir -p "$fixture_root/lib/src/Cardano/Injected"
  printf '%s\n' 'duplicate = "https://api.koios.rest/api/v1/tx_cbor"' > "$fixture_root/lib/src/Cardano/Injected/Provider.purs"
  if duplicate_output="$(check_tree "$fixture_root" 2>&1)"; then
    fail "negative fixture unexpectedly accepted duplicate provider implementation"
  fi
  [[ "$duplicate_output" == *'provider endpoint/auth/request policy must live only'* ]] ||
    fail "negative fixture emitted the wrong duplicate-provider diagnostic: $duplicate_output"
  rm "$fixture_root/lib/src/Cardano/Injected/Provider.purs"

  printf '%s\n' 'const endpoint = "https://api.koios.rest/api/v1/tx_cbor";' > "$fixture_root/cli/injected-provider.mjs"
  if duplicate_output="$(check_tree "$fixture_root" 2>&1)"; then
    fail "negative fixture unexpectedly accepted host provider implementation"
  fi
  [[ "$duplicate_output" == *'CLI/Node host must delegate provider'* ]] ||
    fail "negative fixture emitted the wrong host-provider diagnostic: $duplicate_output"
  rm "$fixture_root/cli/injected-provider.mjs"

  printf '%s\n' 'const requestPolicy = "Authorization: project_id";' > "$fixture_root/node/src/injected-provider-policy.mjs"
  if duplicate_output="$(check_tree "$fixture_root" 2>&1)"; then
    fail "negative fixture unexpectedly accepted host provider decoder/policy"
  fi
  [[ "$duplicate_output" == *'CLI/Node host must delegate provider'* ]] ||
    fail "negative fixture emitted the wrong host-provider-policy diagnostic: $duplicate_output"
  rm "$fixture_root/node/src/injected-provider-policy.mjs"

  printf '%s\n' 'import "cbor-x";' > "$fixture_root/node/src/injected-cbor.mjs"
  if duplicate_output="$(check_tree "$fixture_root" 2>&1)"; then
    fail "negative fixture unexpectedly accepted host ledger/CBOR semantics"
  fi
  [[ "$duplicate_output" == *'CLI/Node host must not own'* ]] ||
    fail "negative fixture emitted the wrong host-ledger diagnostic: $duplicate_output"
  rm "$fixture_root/node/src/injected-cbor.mjs"

  printf '%s\n' 'import "sparqljs";' > "$fixture_root/node/src/injected-rdf.mjs"
  if duplicate_output="$(check_tree "$fixture_root" 2>&1)"; then
    fail "negative fixture unexpectedly accepted host RDF semantics"
  fi
  [[ "$duplicate_output" == *'CLI/Node host must not own'* ]] ||
    fail "negative fixture emitted the wrong host-semantics diagnostic: $duplicate_output"
  rm "$fixture_root/node/src/injected-rdf.mjs"

  printf '%s\n' 'import "ed25519";' > "$fixture_root/cli/injected-crypto.mjs"
  if duplicate_output="$(check_tree "$fixture_root" 2>&1)"; then
    fail "negative fixture unexpectedly accepted host cryptographic fallback"
  fi
  [[ "$duplicate_output" == *'CLI/Node host must not own'* ]] ||
    fail "negative fixture emitted the wrong host-crypto diagnostic: $duplicate_output"
  rm "$fixture_root/cli/injected-crypto.mjs"

  printf '%s\n' 'import "plutus-core";' > "$fixture_root/cli/injected-plutus.mjs"
  if duplicate_output="$(check_tree "$fixture_root" 2>&1)"; then
    fail "negative fixture unexpectedly accepted host Plutus fallback"
  fi
  [[ "$duplicate_output" == *'CLI/Node host must not own'* ]] ||
    fail "negative fixture emitted the wrong host-Plutus diagnostic: $duplicate_output"
  rm "$fixture_root/cli/injected-plutus.mjs"

  printf '%s\n' 'import "blake2b";' > "$fixture_root/node/src/injected-blake2b.mjs"
  if duplicate_output="$(check_tree "$fixture_root" 2>&1)"; then
    fail "negative fixture unexpectedly accepted host blake2b fallback"
  fi
  [[ "$duplicate_output" == *'CLI/Node host must not own'* ]] ||
    fail "negative fixture emitted the wrong host-blake2b diagnostic: $duplicate_output"
  rm "$fixture_root/node/src/injected-blake2b.mjs"

  printf '%s\n' 'runTransactionOperation("tx.validate", transaction, {});' > "$fixture_root/cli/injected-ledger-route.mjs"
  if duplicate_output="$(check_tree "$fixture_root" 2>&1)"; then
    fail "negative fixture unexpectedly accepted direct host ledger routing"
  fi
  [[ "$duplicate_output" == *'CLI transaction routes must delegate'* ]] ||
    fail "negative fixture emitted the wrong direct-ledger-route diagnostic: $duplicate_output"
  rm "$fixture_root/cli/injected-ledger-route.mjs"

  # Direct engine/protocol bypass: a host file that instantiates a WASM engine
  # directly (outside the two designated engine wrappers) must be rejected.
  printf '%s\n' 'import { WASI } from "@bjorn3/browser_wasi_shim"; const m = await WebAssembly.compile(bytes);' > "$fixture_root/node/src/injected-engine-bypass.mjs"
  if duplicate_output="$(check_tree "$fixture_root" 2>&1)"; then
    fail "negative fixture unexpectedly accepted a direct host engine bypass"
  fi
  [[ "$duplicate_output" == *'direct engine/protocol'* ]] ||
    fail "negative fixture emitted the wrong engine-bypass diagnostic: $duplicate_output"
  rm "$fixture_root/node/src/injected-engine-bypass.mjs"

  printf '%s\n' 'const bytes = await readFile(new URL("./cardano-addresses.wasm", import.meta.url));' > "$fixture_root/cli/injected-wasm.mjs"
  if duplicate_output="$(check_tree "$fixture_root" 2>&1)"; then
    fail "negative fixture unexpectedly accepted a direct host wasm reference"
  fi
  [[ "$duplicate_output" == *'direct engine/protocol'* ]] ||
    fail "negative fixture emitted the wrong wasm-bypass diagnostic: $duplicate_output"
  rm "$fixture_root/cli/injected-wasm.mjs"

  # Silent-fallback behavior: an engine catch that returns a semantic success
  # must be rejected even when it contains no forbidden prose marker.
  printf '%s\n' 'try { return await engineInspect(tx); } catch { return { ok: true, value: {} }; }' > "$fixture_root/node/src/commands/injected-fallback.mjs"
  if duplicate_output="$(check_tree "$fixture_root" 2>&1)"; then
    fail "negative fixture unexpectedly accepted silent-fallback behavior"
  fi
  [[ "$duplicate_output" == *'silent fallback'* ]] ||
    fail "negative fixture emitted the wrong silent-fallback diagnostic: $duplicate_output"
  rm "$fixture_root/node/src/commands/injected-fallback.mjs"

  # Cleanup-only catches and catch/rethrow handling preserve the engine failure
  # and must remain accepted; the rule is about semantic substitution, not the
  # spelling of a catch block.
  printf '%s\n' 'try { return await engineInspect(tx); } catch (error) { cleanup(error); throw error; }' > "$fixture_root/node/src/commands/accepted-rethrow.mjs"
  printf '%s\n' 'await closeHandle().catch(() => {});' > "$fixture_root/node/src/commands/accepted-cleanup.mjs"
  if ! duplicate_output="$(check_tree "$fixture_root" 2>&1)"; then
    fail "negative fixture incorrectly rejected legitimate cleanup/rethrow handling: $duplicate_output"
  fi
  rm "$fixture_root/node/src/commands/accepted-rethrow.mjs" "$fixture_root/node/src/commands/accepted-cleanup.mjs"

  printf '%s\n' '    "cbor-x": "fixture-only"' >> "$fixture_root/package.json"
  if dependency_output="$(check_tree "$fixture_root" 2>&1)"; then
    fail "negative fixture unexpectedly accepted forbidden semantic dependency"
  fi
  [[ "$dependency_output" == *'host/shared manifest dependency substitutes authoritative'* ]] ||
    fail "negative fixture emitted the wrong semantic-dependency diagnostic: $dependency_output"

  echo "architecture boundary: negative fixture rejected duplicate provider implementation"
  echo "architecture boundary: negative fixture rejected host provider implementation"
  echo "architecture boundary: negative fixture rejected host provider decoder/policy"
  echo "architecture boundary: negative fixture rejected host ledger/CBOR semantics"
  echo "architecture boundary: negative fixture rejected host RDF semantics"
  echo "architecture boundary: negative fixture rejected host cryptographic fallback"
  echo "architecture boundary: negative fixture rejected host Plutus fallback"
  echo "architecture boundary: negative fixture rejected host blake2b fallback"
  echo "architecture boundary: negative fixture rejected direct host ledger routing"
  echo "architecture boundary: negative fixture rejected direct host engine bypass"
  echo "architecture boundary: negative fixture rejected direct host wasm reference"
  echo "architecture boundary: negative fixture rejected semantic success from an engine catch"
  echo "architecture boundary: negative fixture accepted cleanup-only and catch/rethrow handling"
  echo "architecture boundary: negative fixture rejected forbidden semantic dependency"
}

check_tree "$repo_root"
run_negative_self_tests
echo "architecture boundary: provider ownership, compatibility adapters, semantic dependencies, and documentation anchors verified"

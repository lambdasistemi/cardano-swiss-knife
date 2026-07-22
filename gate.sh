#!/usr/bin/env bash
set -euo pipefail

local_provider_context_inventory() {
  local node_api="node/src/index.js"
  local node_types="node/src/index.d.ts"
  local cli="cli/csk.mjs"
  local node_proof="node/test/api-properties.test.mjs"
  local cli_proof="node/test/cli.test.mjs"
  local package_proof="node/test/package-smoke.mjs"
  local architecture_proof="scripts/check-architecture-boundary.sh"

  for path in "$node_api" "$node_types" "$cli" "$node_proof" "$cli_proof" "$package_proof" "$architecture_proof"; do
    test -f "$path"
  done

  rg -q 'const providerContextSelection' "$node_api"
  rg -q 'Provider\.resolveProducerTxContext' "$node_api"
  rg -q 'export interface LocalProviderContext' "$node_types"
  rg -q 'export interface OfflineLocalProviderContext' "$node_types"
  rg -q 'const providerSelection' "$cli"
  rg -q 'blockfrost-project-id' "$cli"
  rg -q 'koios-bearer-token' "$cli"
  rg -q 'local transaction sources use explicit shared provider context' "$node_proof"
  rg -q 'enriches every local CLI transaction source' "$cli_proof"
  rg -q 'installed CLI must resolve local provider context from a foreign CWD' "$package_proof"
  bash "$architecture_proof"
}

git diff --check
git diff --check origin/main...HEAD
local_provider_context_inventory
nix run .#ci-node-api
nix run .#ci-node-package
nix run .#ci-inspector-playwright

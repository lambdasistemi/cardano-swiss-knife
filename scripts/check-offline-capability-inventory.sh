#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
inventory="$repo_root/specs/070-offline-cli-node-api/capability-inventory.md"

fail() {
  echo "offline capability inventory: $*" >&2
  exit 1
}

require_mapping() {
  local id="$1"
  local facade="$2"
  local authoritative_module="$3"

  rg -Fq "| $id |" "$inventory" || fail "inventory row is missing: $id"
  [[ -f "$facade" ]] || fail "missing facade for $id: ${facade#"$repo_root"/}"
  rg -Fq "import $authoritative_module" "$facade" ||
    fail "$id does not delegate to $authoritative_module through ${facade#"$repo_root"/}"
}

address="$repo_root/lib/src/Cardano/Offline/Address.purs"
mnemonic="$repo_root/lib/src/Cardano/Offline/Mnemonic.purs"
key="$repo_root/lib/src/Cardano/Offline/Key.purs"
script="$repo_root/lib/src/Cardano/Offline/Script.purs"
payload="$repo_root/lib/src/Cardano/Offline/Payload.purs"

require_mapping ADDR-001 "$address" Cardano.Address.Inspect
require_mapping MN-001 "$mnemonic" Cardano.Mnemonic
require_mapping MN-002 "$mnemonic" Cardano.Mnemonic
require_mapping KEY-001 "$key" Cardano.Address.Derivation
require_mapping KEY-002 "$key" Cardano.Address.Shelley
require_mapping KEY-003 "$key" Cardano.Address.Bootstrap
require_mapping KEY-004 "$key" Cardano.Address.Bootstrap
require_mapping KEY-005 "$key" Cardano.Address.Bootstrap
require_mapping KEY-006 "$key" Cardano.Address.Bootstrap
require_mapping PAY-001 "$payload" Cardano.Address.Signing
require_mapping PAY-002 "$payload" Cardano.Address.Signing
require_mapping SCR-001 "$script" Cardano.Address.Script
require_mapping SCR-002 "$script" Cardano.Address.Script
require_mapping SCR-003 "$script" Cardano.Address.Script

echo "offline capability inventory: all 14 checked rows map to delegation facades"

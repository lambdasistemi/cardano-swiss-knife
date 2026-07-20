{ pkgs, repoRoot }:
let script = pkgs.writeShellApplication { name = "cardano-swiss-knife-vault-cli-test"; runtimeInputs = [ pkgs.nodejs_22 pkgs.age pkgs.expect pkgs.coreutils ]; text = ''node --test test/vault-cli.test.mjs test/vault-cross-host.test.mjs''; }; in { type = "app"; program = "${script}/bin/cardano-swiss-knife-vault-cli-test"; }

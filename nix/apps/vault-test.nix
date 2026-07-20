{ pkgs, repoRoot }:

let
  script = pkgs.writeShellApplication {
    name = "cardano-swiss-knife-vault-test";
    runtimeInputs = [ pkgs.nodejs_22 pkgs.age pkgs.expect ];
    text = ''
      node --test test/vault-core.test.mjs
    '';
  };
in
{
  type = "app";
  program = "${script}/bin/cardano-swiss-knife-vault-test";
  meta.description = "Portable age vault core tests";
}

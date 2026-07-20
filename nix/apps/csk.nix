{ pkgs, repoRoot }:
let script = pkgs.writeShellApplication { name = "csk"; runtimeInputs = [ pkgs.nodejs_22 ]; text = ''exec node ${repoRoot}/cli/csk.mjs "$@"''; }; in { type = "app"; program = "${script}/bin/csk"; }

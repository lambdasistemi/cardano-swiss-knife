{ pkgs, nodeApi }:
let script = pkgs.writeShellApplication { name = "csk"; runtimeInputs = [ pkgs.nodejs_22 pkgs.coreutils ]; text = ''exec node ${nodeApi}/node/dist/csk.mjs "$@"''; }; in { type = "app"; program = "${script}/bin/csk"; }

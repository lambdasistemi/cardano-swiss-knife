{ pkgs, system }:

let
  mkCheckApp =
    {
      name,
      checkName,
    }:
    let
      script = pkgs.writeShellApplication {
        inherit name;
        runtimeInputs = [
          pkgs.nix
        ];
        text = ''
          nix build ".#checks.${system}.${checkName}"
        '';
      };
    in
    {
      type = "app";
      program = "${script}/bin/${name}";
      meta.description = name;
    };
in
{
  inherit mkCheckApp;
}

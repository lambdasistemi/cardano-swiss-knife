{ indexState, pkgs, ... }:

let
  indexTool = { index-state = indexState; };
  shell = { pkgs, ... }: {
    tools = {
      cabal = indexTool;
      cabal-fmt = indexTool;
      fourmolu = indexTool;
      hlint = indexTool;
    };
    buildInputs = [
      pkgs.just
      pkgs.nixfmt-classic
    ];
    shellHook = ''
      echo "Entering cardano-addresses-browser Haskell shell" >&2
    '';
  };

  mkProject = { pkgs, ... }: {
    name = "cardano-addresses-browser-vectors";
    src = ../haskell;
    compiler-nix-name = "ghc984";
    index-state = indexState;
    shell = shell { inherit pkgs; };
  };

  project = pkgs.haskell-nix.cabalProject' mkProject;

in {
  devShells.default = project.shell;
  inherit project;
  packages.test-vectors-exe =
    project.hsPkgs.cardano-addresses-browser-vectors.components.exes.cardano-addresses-browser-vectors;
}

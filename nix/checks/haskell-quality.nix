{ pkgs, repoRoot }:

pkgs.runCommand "cardano-addresses-browser-haskell-quality"
  {
    nativeBuildInputs = [
      pkgs.cabal-install
      pkgs.fourmolu
      pkgs.hlint
    ];
  }
  ''
    cp -R ${repoRoot} source
    chmod -R u+w source
    cd source/haskell
    fourmolu --mode check app/Main.hs
    hlint app
    cabal check
    mkdir -p $out
    touch $out/passed
  ''

{ pkgs, repoRoot }:

pkgs.runCommand "cardano-addresses-browser-format-check"
  {
    nativeBuildInputs = [
      pkgs.nodejs_22
      pkgs.purs-tidy
    ];
  }
  ''
    cp -R ${repoRoot} source
    chmod -R u+w source
    cd source
    purs-tidy check "lib/src/**/*.purs" "app/src/**/*.purs"
    mkdir -p $out
    touch $out/passed
  ''

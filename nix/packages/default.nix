{ pkgs, purescript, testVectorsPath, haskellProject, txInspectorUi, ... }:

{
  inherit (purescript) web-dist;
  inherit testVectorsPath;
  test-vectors-exe = haskellProject.packages.test-vectors-exe;
  tx-inspector-ui = txInspectorUi;
  combined-site = pkgs.runCommand "combined-site" { } ''
    mkdir -p "$out"
    cp -a ${purescript.web-dist}/. "$out/"
    test ! -e "$out/inspector"
    chmod u+w "$out"
    mkdir "$out/inspector"
    cp -a ${txInspectorUi}/. "$out/inspector/"
  '';
}

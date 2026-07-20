{ pkgs, repoRoot, purescript, testVectorsPath, haskellProject, txInspectorUi, ... }:

let
  packageJson = builtins.fromJSON (builtins.readFile (repoRoot + /package.json));
  packedPackageJson = pkgs.writeText "cardano-swiss-knife-package.json" (builtins.toJSON (builtins.removeAttrs packageJson [ "dependencies" "devDependencies" "scripts" ]));
in
{
  inherit (purescript) web-dist;
  inherit testVectorsPath;
  test-vectors-exe = haskellProject.packages.test-vectors-exe;
  tx-inspector-ui = txInspectorUi;
  combined-site = purescript.web-dist;
  node-api = purescript.node-api;
  node-package = pkgs.runCommand "cardano-swiss-knife-node-package" {
    nativeBuildInputs = [ pkgs.nodejs_22 ];
  } ''
    mkdir -p $out
    mkdir package
    cp -a ${purescript.node-api}/node package/
    cp ${packedPackageJson} package/package.json
    cd package
    HOME="$PWD" npm pack --ignore-scripts --pack-destination $out
  '';
}

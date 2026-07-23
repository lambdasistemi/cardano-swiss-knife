{ pkgs, repoRoot, purescript, testVectorsPath, haskellProject, txInspectorUi, ... }:

let
  packageJson = builtins.fromJSON (builtins.readFile (repoRoot + /package.json));
  packedPackageJson = pkgs.writeText "cardano-swiss-knife-package.json" (builtins.toJSON (builtins.removeAttrs packageJson [ "dependencies" "devDependencies" "scripts" ]));
  nodePackage = pkgs.runCommand "cardano-swiss-knife-node-package" {
    nativeBuildInputs = [ pkgs.nodejs_22 ];
  } ''
    mkdir -p $out
    mkdir package
    cp -a ${purescript.node-api}/node package/
    cp ${packedPackageJson} package/package.json
    cd package
    HOME="$PWD" npm pack --ignore-scripts --pack-destination $out
  '';
  # Node-22-backed CLI package that embeds the same packaged distribution as
  # the npm tarball (engines + book/registry assets under node/dist).
  csk = pkgs.runCommand "csk" {
    meta = {
      description = "cardano-swiss-knife CLI (Node 22, packaged distribution)";
      mainProgram = "csk";
    };
  } ''
    mkdir -p $out/share/cardano-swiss-knife $out/bin
    cp -a ${purescript.node-api}/. $out/share/cardano-swiss-knife/
    {
      echo '#!${pkgs.runtimeShell}'
      echo 'set -euo pipefail'
      echo 'export PATH="${pkgs.nodejs_22}/bin:''${PATH:-}"'
      echo "exec node $out/share/cardano-swiss-knife/node/dist/csk.mjs \"\$@\""
    } > $out/bin/csk
    chmod +x $out/bin/csk
  '';
  # Universal release bundle: the npm tarball plus deterministic SHA-256 sums.
  release-bundle = pkgs.runCommand "cardano-swiss-knife-release-bundle" {
    nativeBuildInputs = [ pkgs.coreutils ];
  } ''
    mkdir -p $out
    cp ${nodePackage}/*.tgz $out/
    cd $out
    sha256sum *.tgz > SHA256SUMS
  '';
in
{
  inherit (purescript) web-dist;
  inherit testVectorsPath;
  test-vectors-exe = haskellProject.packages.test-vectors-exe;
  tx-inspector-ui = txInspectorUi;
  combined-site = purescript.web-dist;
  node-api = purescript.node-api;
  node-package = nodePackage;
  inherit csk;
  inherit release-bundle;
}

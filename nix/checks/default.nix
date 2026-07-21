{ pkgs, repoRoot, purescript, packages, playwrightBrowsers, testVectorsPath, wasmBinary, txInspectorWasmBinary }:

{
  format = import ./format.nix { inherit pkgs repoRoot; };
  haskell-quality = import ./haskell-quality.nix { inherit pkgs repoRoot; };
  vectors = import ./vectors.nix { inherit pkgs repoRoot testVectorsPath; };
  lib-build = import ./lib-build.nix { inherit purescript; };
  app-build = import ./app-build.nix { inherit purescript; };
  test = import ./test.nix { inherit purescript; };
  playwright = import ./playwright.nix { inherit pkgs repoRoot purescript playwrightBrowsers wasmBinary txInspectorWasmBinary; };
  node-api = import ./node-api.nix { inherit pkgs repoRoot purescript; nodePackage = packages.node-package; };
  node-package = pkgs.runCommand "cardano-swiss-knife-node-package-check" {
    nativeBuildInputs = [ pkgs.nodejs_22 pkgs.bash ];
  } ''
    mkdir -p work/node/test work/scripts work/test-vectors work/docs/inspector/tests/fixtures
    cp -a ${packages.node-api}/. work/
    chmod -R u+w work
    cp -a ${repoRoot}/node/test/package-smoke.mjs work/node/test/
    cp -a ${repoRoot}/scripts/check-node-package.sh work/scripts/
    cp -a ${repoRoot}/test-vectors/vectors.json work/test-vectors/
    cp ${repoRoot}/docs/inspector/tests/fixtures/treasury-reorganize-unsigned-tx.hex work/docs/inspector/tests/fixtures/treasury-reorganize-unsigned-tx.hex
    cd work
    CSK_PACKAGE_TARBALL="$(echo ${packages.node-package}/*.tgz)" bash scripts/check-node-package.sh
    mkdir -p $out
  '';
}

{ pkgs, repoRoot, purescript, packages, playwrightBrowsers, testVectorsPath, wasmBinary, txInspectorWasmBinary }:

{
  format = import ./format.nix { inherit pkgs repoRoot; };
  haskell-quality = import ./haskell-quality.nix { inherit pkgs repoRoot; };
  vectors = import ./vectors.nix { inherit pkgs repoRoot testVectorsPath; };
  lib-build = import ./lib-build.nix { inherit purescript; };
  app-build = import ./app-build.nix { inherit purescript; };
  test = import ./test.nix { inherit purescript; };
  playwright = import ./playwright.nix { inherit pkgs repoRoot purescript playwrightBrowsers wasmBinary txInspectorWasmBinary; };
}

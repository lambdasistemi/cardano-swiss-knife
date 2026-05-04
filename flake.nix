{
  description = "cardano-swiss-knife — Browser and CLI-oriented Cardano workbench";
  nixConfig = {
    extra-substituters = [ "https://cache.iog.io" ];
    extra-trusted-public-keys =
      [ "hydra.iohk.io:f/Ea+s+dFdN+3Y/G+FDgSq+a5NEWhJGzdjvKNGv0/EQ=" ];
  };

  inputs = {
    haskellNix.url = "github:input-output-hk/haskell.nix";
    nixpkgs.follows = "haskellNix/nixpkgs-unstable";
    flake-parts.url = "github:hercules-ci/flake-parts";
    mkSpagoDerivation = {
      url = "github:jeslie0/mkSpagoDerivation";
      inputs.nixpkgs.follows = "nixpkgs";
    };
    purescript-overlay = {
      url = "github:paolino/purescript-overlay/fix/remove-nodePackages";
      inputs.nixpkgs.follows = "nixpkgs";
    };
    cardano-addresses = {
      url = "github:paolino/cardano-addresses/001-wasm-target";
    };
    cardano-ledger-inspector = {
      url = "github:lambdasistemi/cardano-ledger-inspector";
    };
  };

  outputs = inputs@{ self, nixpkgs, flake-parts, haskellNix, mkSpagoDerivation, purescript-overlay, cardano-addresses, cardano-ledger-inspector, ... }:
    flake-parts.lib.mkFlake { inherit inputs; } {
      systems = [ "x86_64-linux" "aarch64-darwin" "x86_64-darwin" ];
      perSystem = { system, ... }:
        let
          pkgs = import nixpkgs {
            inherit system;
            overlays = [
              haskellNix.overlay
              mkSpagoDerivation.overlays.default
              purescript-overlay.overlays.default
            ];
          };
          indexState = "2026-04-05T22:14:51Z";
          repoRoot = ./.;
          haskellProject = import ./nix/project.nix {
            inherit indexState pkgs;
          };
          wasmBinary = cardano-addresses.packages.${system}.wasm;
          txInspectorWasmBinary = cardano-ledger-inspector.packages.${system}."wasm-tx-inspector";
          playwrightBrowsers = pkgs.playwright-driver.browsers;
          test-vectors-json = pkgs.runCommand "cardano-addresses-browser-test-vectors" {} ''
            mkdir -p $out
            ${haskellProject.packages.test-vectors-exe}/bin/cardano-addresses-browser-vectors > $out/vectors.json
          '';
          testVectorsPath = test-vectors-json;
          purescript = import ./nix/purescript.nix {
            inherit pkgs repoRoot wasmBinary txInspectorWasmBinary;
          };
          packages = import ./nix/packages {
            inherit pkgs repoRoot purescript haskellProject playwrightBrowsers testVectorsPath;
          };
          checks = import ./nix/checks {
            inherit pkgs repoRoot purescript packages playwrightBrowsers testVectorsPath wasmBinary txInspectorWasmBinary;
          };
          apps = import ./nix/apps {
            inherit pkgs checks system;
          };
        in
        {
          packages.playwright-browsers = playwrightBrowsers;
          packages.test-vectors-exe = haskellProject.packages.test-vectors-exe;
          packages.test-vectors = test-vectors-json;
          packages.wasm = wasmBinary;
          packages.tx-inspector-wasm = txInspectorWasmBinary;
          packages.web-dist = packages.web-dist;
          checks = checks;
          inherit apps;
          devShells.default = pkgs.mkShell {
            inputsFrom = [ haskellProject.devShells.default ];
            packages = [
              pkgs.cabal-install
              pkgs.fourmolu
              pkgs.hlint
              pkgs.purs
              pkgs.spago
              pkgs.purs-tidy
              pkgs.purs-backend-es
              pkgs.purescript-language-server
              pkgs.esbuild
              pkgs.nodejs_22
              pkgs.just
            ];
          };
        };
    };
}

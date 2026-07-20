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
    rdf-shapes-wasm = {
      url = "github:lambdasistemi/rdf-shapes-wasm/1240e4e58061836264d955b70c49c7195480f3b4";
      inputs.purescript-overlay.follows = "purescript-overlay";
      inputs.mkSpagoDerivation.follows = "mkSpagoDerivation";
    };
  };

  outputs = inputs@{ self, nixpkgs, flake-parts, haskellNix, mkSpagoDerivation, purescript-overlay, cardano-addresses, cardano-ledger-inspector, rdf-shapes-wasm, ... }:
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
          inspectorSource = cardano-ledger-inspector.outPath;
          protocolRegistry = cardano-ledger-inspector.packages.${system}.protocol-registry;
          haskellProject = import ./nix/project.nix {
            inherit indexState pkgs;
          };
          wasmBinary = cardano-addresses.packages.${system}.wasm;
          txInspectorWasmBinary = cardano-ledger-inspector.packages.${system}.wasm-tx-inspector;
          txInspectorUi = import ./nix/wasm-ui.nix {
            inherit system nixpkgs purescript-overlay mkSpagoDerivation;
            wasmArtifact = cardano-ledger-inspector.packages.${system}.wasm-tx-inspector;
            wasmArtifactName = "wasm-tx-inspector";
            rdfShapesWasmPkg = rdf-shapes-wasm.packages.${system}.wasm-pkg;
            addressWasmArtifact = wasmBinary;
            inherit protocolRegistry;
            addressPackageSrc = ./lib;
            editorPackageSrc = ./packages/purescript-rdf-editor;
            src = ./docs/inspector;
          };
          playwrightBrowsers = pkgs.playwright-driver.browsers;
          uxJudgeSource = ./tools/ux-judge;
          test-vectors-json = pkgs.runCommand "cardano-addresses-browser-test-vectors" {} ''
            mkdir -p $out
            ${haskellProject.packages.test-vectors-exe}/bin/cardano-addresses-browser-vectors > $out/vectors.json
          '';
          testVectorsPath = test-vectors-json;
          purescript = import ./nix/purescript.nix {
            inherit pkgs repoRoot txInspectorUi wasmBinary txInspectorWasmBinary;
          };
          packages = import ./nix/packages {
            inherit pkgs repoRoot purescript haskellProject playwrightBrowsers testVectorsPath txInspectorUi;
          };
          checks = import ./nix/checks {
            inherit pkgs repoRoot purescript packages playwrightBrowsers testVectorsPath wasmBinary txInspectorWasmBinary;
          };
          apps = import ./nix/apps {
            inherit pkgs checks system repoRoot playwrightBrowsers txInspectorUi inspectorSource protocolRegistry uxJudgeSource;
            nodeApi = packages.node-api;
            combinedSite = packages.combined-site;
            webDist = packages.web-dist;
          };
        in
        {
          packages.playwright-browsers = playwrightBrowsers;
          packages.test-vectors-exe = haskellProject.packages.test-vectors-exe;
          packages.test-vectors = test-vectors-json;
          packages.wasm = wasmBinary;
          packages.node-api = packages.node-api;
          packages.node-package = packages.node-package;
          packages.tx-inspector-wasm = txInspectorWasmBinary;
          packages.tx-inspector-ui = packages.tx-inspector-ui;
          packages.web-dist = packages.web-dist;
          packages.combined-site = packages.combined-site;
          checks = checks;
          inherit apps;
          devShells.default = pkgs.mkShell {
            inputsFrom = [ haskellProject.devShells.default ];
            shellHook = ''
              if [ ! -e node_modules ] && [ ! -L node_modules ]; then
                ln -s ${purescript.nodeModules}/node_modules node_modules
              fi
            '';
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

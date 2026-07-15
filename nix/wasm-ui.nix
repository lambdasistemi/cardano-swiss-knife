# PureScript bundle for the WASM tx inspector demo.
#
# Gated behind its own flake inputs (purescript-overlay + mkSpagoDerivation) so
# downstream consumers who don't need the UI never instantiate the PS toolchain.
#
# Pattern ported from the /purescript skill (graph-browser, cardano-mpfs-browser):
#   1. importNpmLock.buildNodeModules → reproducible node_modules from committed
#      package-lock.json
#   2. esbuild bundles src/bootstrap.js and emits WASM assets with hashed names
#      → dist/deps.js + dist/*.wasm
#   3. spago bundle --offline --module Main → dist/index.js
#   4. Concatenate deps + app → final dist/index.js
#
# The inspector's .wasm is pulled in as a build-time input and copied into the
# src tree before bundling, so esbuild's `--loader:.wasm=file` emits it as a
# cacheable browser asset.
{ system
, nixpkgs
, purescript-overlay
, mkSpagoDerivation
, wasmArtifact        # derivation whose $out/<name>.wasm is the embedded binary
, wasmArtifactName    # e.g. "wasm-ledger-smoke"  (used to pick <name>.wasm)
, addressWasmArtifact # derivation whose $out/cardano-addresses.wasm is bundled
, rdfShapesWasmPkg    # wasm-bindgen web bundle from lambdasistemi/rdf-shapes-wasm
, protocolRegistry   # packaged inspector protocol registry
, addressPackageSrc ? null
, editorPackageSrc ? null
, src                 # PS project tree (./docs/inspector relative to flake root)
}:

let
  pkgs = import nixpkgs {
    inherit system;
    overlays = [
      purescript-overlay.overlays.default
      mkSpagoDerivation.overlays.default
    ];
  };

  nodeModules = pkgs.importNpmLock.buildNodeModules {
    npmRoot = src;
    nodejs = pkgs.nodejs_20;
  };

  editorPackageSetup = if editorPackageSrc == null then "" else ''
    mkdir -p ../packages
    cp -R ${editorPackageSrc} ../packages/purescript-rdf-editor
    chmod -R u+w ../packages/purescript-rdf-editor
    substituteInPlace spago.yaml \
      --replace-fail "path: ../../packages/purescript-rdf-editor" \
                     "path: ../packages/purescript-rdf-editor"
    substituteInPlace spago.lock \
      --replace-fail '"path": "../../packages/purescript-rdf-editor"' \
                     '"path": "../packages/purescript-rdf-editor"'
  '';

  addressPackageSetup = if addressPackageSrc == null then "" else ''
    cp -R ${addressPackageSrc} ../lib
    chmod -R u+w ../lib
    substituteInPlace spago.yaml \
      --replace-fail "path: ../../lib" \
                     "path: ../lib"
    substituteInPlace spago.lock \
      --replace-fail '"path": "../../lib"' \
                     '"path": "../lib"'
  '';

  editorPackageEsbuildArgs =
    if editorPackageSrc == null then "" else
      "--alias:purescript-rdf-editor=../packages/purescript-rdf-editor/index.js";

in
pkgs.mkSpagoDerivation {
  pname = "tx-inspector-ui";
  version = "0.1.0";
  inherit src;
  spagoYaml = src + "/spago.yaml";
  spagoLock = src + "/spago.lock";

  nativeBuildInputs = [
    pkgs.purs
    pkgs.spago-unstable
    pkgs.esbuild
    pkgs.nodejs_20
    pkgs.gzip
    pkgs.brotli
  ];

  buildPhase = ''
    ${editorPackageSetup}
    ${addressPackageSetup}

    ln -s ${nodeModules}/node_modules node_modules
    ln -s ${nodeModules}/node_modules ../node_modules

    # Materialize only the registry files imported by the browser bundle.
    mkdir -p protocols/sundaeswap-v3 protocols/cardano-rdf
    cp ${protocolRegistry}/sundaeswap-v3/plutus.json \
      protocols/sundaeswap-v3/plutus.json
    cp ${protocolRegistry}/cardano-rdf/shapes.ttl \
      protocols/cardano-rdf/shapes.ttl

    # Copy the WASM binaries into the src tree so esbuild's --loader:.wasm=file
    # can emit hashed browser assets at bundle time.
    mkdir -p src/assets
    cp ${wasmArtifact}/${wasmArtifactName}.wasm src/assets/inspector.wasm
    cp ${addressWasmArtifact}/cardano-addresses.wasm src/assets/cardano-addresses.wasm
    cp ${rdfShapesWasmPkg}/rdf_shapes_wasm.js src/assets/rdf_shapes_wasm.js
    cp ${rdfShapesWasmPkg}/rdf_shapes_wasm_bg.wasm src/assets/rdf_shapes_wasm_bg.wasm
    chmod -R u+w src/assets

    # 1. npm deps + WASM asset URLs → dist/deps.js (IIFE) + dist/*.wasm
    esbuild src/bootstrap.js \
      --bundle \
      --outfile=dist/deps.js \
      --format=iife \
      --platform=browser \
      --external:fs \
      --external:path \
      ${editorPackageEsbuildArgs} \
      --loader:.wasm=file \
      --loader:.ttl=text \
      --asset-names='[name].[hash]' \
      --public-path=. \
      --minify

    # 2. PureScript → dist/index.js
    spago bundle --offline --module Main

    # 3. Concatenate deps first, then app
    cat dist/deps.js dist/index.js > dist/bundle.js
    mv dist/bundle.js dist/index.js
    rm dist/deps.js
  '';

  installPhase = ''
    mkdir -p $out
    cp dist/index.html $out/
    cp dist/index.js $out/
    cp dist/styles.css $out/
    cp dist/material.js $out/
    cp dist/*.wasm $out/

    for route in inspect settings library addresses keys scripts vault; do
      mkdir -p "$out/$route"
      sed \
        -e 's#href="./styles.css"#href="../styles.css"#' \
        -e 's#src="./material.js"#src="../material.js"#' \
        -e 's#src="./index.js#src="../index.js#' \
        dist/index.html > "$out/$route/index.html"
    done

    while IFS= read -r -d "" asset; do
      gzip -9 -n -k "$asset"
      brotli --best --keep "$asset"
    done < <(find "$out" -type f \
      \( -name '*.html' -o -name '*.js' -o -name '*.css' -o -name '*.wasm' \) \
      -print0)
  '';

  passthru = { inherit nodeModules pkgs; };
}

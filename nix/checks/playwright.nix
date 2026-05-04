{ pkgs, repoRoot, purescript, playwrightBrowsers, wasmBinary, txInspectorWasmBinary }:

pkgs.runCommand "cardano-addresses-browser-playwright-check"
  {
    nativeBuildInputs = [
      purescript.nodejs
      pkgs.playwright-test
      pkgs.python3
      pkgs.bash
    ];
  }
  ''
    cp -R ${repoRoot} source
    chmod -R u+w source
    cd source
    ln -s ${purescript.playwrightNodeModules}/node_modules node_modules
    rm -rf dist
    mkdir -p dist/wasm
    cp ${purescript.web-dist}/index.html dist/index.html
    cp ${purescript.web-dist}/app.js dist/app.js
    cp ${wasmBinary}/cardano-addresses.wasm dist/wasm/cardano-addresses.wasm
    cp ${txInspectorWasmBinary}/wasm-tx-inspector.wasm dist/wasm/wasm-tx-inspector.wasm
    export HOME=$(mktemp -d)
    export PLAYWRIGHT_BROWSERS_PATH="${playwrightBrowsers}"
    export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
    export PLAYWRIGHT_WEB_SERVER_COMMAND="python -m http.server 34173 --bind 127.0.0.1 --directory dist"
    ./node_modules/.bin/playwright test --reporter=list
    mkdir -p $out
    touch $out/passed
  ''

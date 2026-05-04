default:
  @just --list

install:
  npm install
  npx spago install -p cardano-addresses
  npx spago install -p cardano-addresses-browser

build:
  npx spago build -p cardano-addresses
  npx spago build -p cardano-addresses-browser

test:
  npx spago test -p cardano-addresses-test

test-playwright: bundle
  npx playwright test --reporter=list

build-docs:
  nix develop github:paolino/dev-assets?dir=mkdocs --quiet -c mkdocs build --strict

assemble-site:
  rm -rf result-dist site site-root
  nix build .#web-dist -o result-dist
  just build-docs
  mkdir -p site-root/docs
  cp -LR result-dist/* site-root/
  chmod -R u+w site-root
  cp -R site/* site-root/docs/

haskell-format:
  cd haskell && fourmolu -i app/Main.hs

haskell-format-check:
  cd haskell && fourmolu --mode check app/Main.hs

haskell-lint:
  cd haskell && hlint app

haskell-cabal-check:
  cd haskell && cabal check

haskell-quality: haskell-format-check haskell-lint haskell-cabal-check

vectors:
  rm -rf result
  nix build .#test-vectors
  mkdir -p test-vectors
  cp result/vectors.json test-vectors/vectors.json

check-vectors:
  rm -rf result
  nix build .#test-vectors
  diff -u test-vectors/vectors.json result/vectors.json

bundle:
  just build
  npx esbuild output/Main/index.js --bundle --outfile=dist/app.js --format=esm --minify --alias:fs=./app/shims/fs.cjs --alias:path=./app/shims/path.cjs

wasm-assets:
  rm -rf result result-tx-inspector
  nix build "path:$PWD#wasm" -o result
  nix build "path:$PWD#tx-inspector-wasm" -o result-tx-inspector
  mkdir -p dist/wasm
  cp result/cardano-addresses.wasm dist/wasm/cardano-addresses.wasm
  cp result-tx-inspector/wasm-tx-inspector.wasm dist/wasm/wasm-tx-inspector.wasm

bundle-lib:
  npx spago build -p cardano-addresses
  npx esbuild output/Cardano.Address/index.js --bundle --outfile=dist/cardano-addresses.js --format=esm --minify

dev:
  just build
  npx esbuild output/Main/index.js --bundle --outfile=dist/app.js --format=esm --serve=0.0.0.0:8080 --servedir=dist --alias:fs=./app/shims/fs.cjs --alias:path=./app/shims/path.cjs

format:
  npx purs-tidy format-in-place "lib/src/**/*.purs" "app/src/**/*.purs"

check:
  npx purs-tidy check "lib/src/**/*.purs" "app/src/**/*.purs"

ci: check build haskell-quality check-vectors test test-playwright

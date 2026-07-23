default:
  @just --list

install:
  npm install
  npx spago install -p cardano-addresses

build:
  npx spago build -p cardano-addresses
  nix build .#web-dist --no-link

test:
  npx spago test -p cardano-addresses-test

test-playwright:
  nix run .#ci-playwright

build-api-docs:
  rm -rf result-api-docs docs/api
  nix build .#node-api-docs --out-link result-api-docs
  mkdir -p docs/api
  cp -LR result-api-docs/. docs/api/
  chmod -R u+w docs/api

build-docs: build-api-docs
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
  rm -rf result-dist
  nix build .#web-dist -o result-dist

bundle-lib:
  npx spago build -p cardano-addresses
  npx esbuild output/Cardano.Address/index.js --bundle --outfile=dist/cardano-addresses.js --format=esm --minify

dev:
  just bundle
  npx serve result-dist -l 8080

format:
  npx purs-tidy format-in-place "lib/src/**/*.purs"

check:
  npx purs-tidy check "lib/src/**/*.purs"

release-gates:
  node scripts/check-release-manifests.mjs
  node scripts/check-release-parity.mjs
  bash scripts/check-architecture-boundary.sh
  node --test node/test/release-manifests.test.mjs node/test/release-parity.test.mjs

release-package:
  node --test node/test/release-package.test.mjs

ci: check build haskell-quality check-vectors test test-playwright release-gates release-package

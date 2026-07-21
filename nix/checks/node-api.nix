{ pkgs, repoRoot, purescript, nodePackage }:

pkgs.runCommand "cardano-swiss-knife-node-api-check" {
  nativeBuildInputs = [ pkgs.nodejs_22 pkgs.gnutar pkgs.gzip pkgs.ripgrep pkgs.bash ];
} ''
  mkdir -p work/node work/scripts work/test-vectors work/fixtures
  cp -a ${repoRoot}/node/test work/node/
  cp -a ${repoRoot}/node/src work/node/
  cp ${repoRoot}/scripts/check-node-api-exports.mjs work/scripts/
  cp ${repoRoot}/eslint.config.js work/scripts/
  cp -a ${repoRoot}/lib work/lib
  ln -s ${purescript.nodeModules}/node_modules work/node_modules
  ln -s ${purescript.documentationToolNodeModules}/node_modules work/scripts/node_modules
  mkdir unpacked-package
  tar -xzf "$(echo ${nodePackage}/*.tgz)" -C unpacked-package
  cp -a unpacked-package/package/node/dist work/node/
  cp -a ${repoRoot}/test-vectors/vectors.json work/test-vectors/
  cp ${repoRoot}/docs/inspector/tests/fixtures/treasury-reorganize-unsigned-tx.hex work/fixtures/conway-mainnet-tx.hex
  cd work
  scripts/node_modules/.bin/eslint --config scripts/eslint.config.js node/src/index.js node/src/error.js
  bash ${repoRoot}/scripts/check-architecture-boundary.sh ${repoRoot}
  node scripts/check-node-api-exports.mjs --runtime ../unpacked-package/package/node/dist/index.js --facade ../unpacked-package/package/node/dist/index.d.ts
  CSK_PACKAGE_TARBALL="$(echo ${nodePackage}/*.tgz)" node --test node/test/api-contract.test.mjs node/test/api.test.mjs node/test/cli.test.mjs node/test/transaction-api.test.mjs node/test/transaction-provider.test.mjs node/test/transaction-books.test.mjs node/test/transaction-ledger.test.mjs node/test/transaction-witness.test.mjs
  mkdir -p $out
''

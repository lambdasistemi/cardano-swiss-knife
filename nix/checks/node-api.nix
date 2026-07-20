{ pkgs, repoRoot, nodePackage }:

pkgs.runCommand "cardano-swiss-knife-node-api-check" {
  nativeBuildInputs = [ pkgs.nodejs_22 ];
} ''
  mkdir -p work/node work/test-vectors
  cp -a ${repoRoot}/node/test work/node/
  cp -a ${repoRoot}/test-vectors/vectors.json work/test-vectors/
  mkdir -p work/fixtures
  cp ${repoRoot}/docs/inspector/tests/fixtures/treasury-reorganize-unsigned-tx.hex work/fixtures/conway-mainnet-tx.hex
  cd work
  CSK_PACKAGE_TARBALL="$(echo ${nodePackage}/*.tgz)" node --test node/test/api.test.mjs node/test/transaction-api.test.mjs node/test/transaction-provider.test.mjs
  mkdir -p $out
''

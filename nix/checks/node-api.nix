{ pkgs, repoRoot, nodePackage }:

pkgs.runCommand "cardano-swiss-knife-node-api-check" {
  nativeBuildInputs = [ pkgs.nodejs_22 ];
} ''
  mkdir -p work/node work/test-vectors
  cp -a ${repoRoot}/node/test work/node/
  cp -a ${repoRoot}/test-vectors/vectors.json work/test-vectors/
  cd work
  CSK_PACKAGE_TARBALL="$(echo ${nodePackage}/*.tgz)" node --test node/test/api.test.mjs
  mkdir -p $out
''

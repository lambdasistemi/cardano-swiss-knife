{ pkgs, repoRoot, nodeApi }:

pkgs.runCommand "cardano-swiss-knife-node-api-check" {
  nativeBuildInputs = [ pkgs.nodejs_22 ];
} ''
  mkdir -p work/node
  cp -a ${nodeApi}/. work/
  chmod -R u+w work
  cp -a ${repoRoot}/node/test work/node/
  cp -a ${repoRoot}/test-vectors work/
  cd work
  node --test node/test/api.test.mjs
  mkdir -p $out
''

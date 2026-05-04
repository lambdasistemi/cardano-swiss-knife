{ pkgs, repoRoot, testVectorsPath }:

pkgs.runCommand "cardano-addresses-browser-vectors-check"
  {
    nativeBuildInputs = [
      pkgs.diffutils
    ];
  }
  ''
    diff -u ${repoRoot}/test-vectors/vectors.json ${testVectorsPath}/vectors.json
    mkdir -p $out
    touch $out/passed
  ''

{ purescript, testVectorsPath, haskellProject, ... }:

{
  inherit (purescript) web-dist;
  inherit testVectorsPath;
  test-vectors-exe = haskellProject.packages.test-vectors-exe;
}

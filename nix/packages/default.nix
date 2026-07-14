{ purescript, testVectorsPath, haskellProject, txInspectorUi, ... }:

{
  inherit (purescript) web-dist;
  inherit testVectorsPath;
  test-vectors-exe = haskellProject.packages.test-vectors-exe;
  tx-inspector-ui = txInspectorUi;
}

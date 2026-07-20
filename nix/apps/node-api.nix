{ lib }:

lib.mkCheckApp {
  name = "cardano-swiss-knife-ci-node-api";
  checkName = "node-api";
}

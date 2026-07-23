{ pkgs, cskPackage }:
# apps.csk and packages.csk share one Node-22 packaged distribution: the app
# program is the packages.csk wrapper, which execs the same packaged entrypoint.
{
  type = "app";
  program = "${cskPackage}/bin/csk";
  meta.description = "cardano-swiss-knife CLI";
}

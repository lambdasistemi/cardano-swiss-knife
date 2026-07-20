{ pkgs, checks, system, repoRoot, playwrightBrowsers, txInspectorUi, inspectorSource, protocolRegistry, uxJudgeSource, combinedSite, webDist }:

let
  lib = import ./lib.nix { inherit pkgs system; };
in
{
  "ci-check" = import ./check.nix { inherit lib; };
  "ci-build" = import ./build.nix { inherit lib; };
  "ci-haskell-quality" = import ./haskell-quality.nix { inherit lib; };
  "ci-check-vectors" = import ./check-vectors.nix { inherit lib; };
  "ci-test" = import ./test.nix { inherit lib; };
  "ci-vault" = import ./vault-test.nix { inherit pkgs repoRoot; };
  "csk" = import ./csk.nix { inherit pkgs repoRoot; };
  "ci-vault-cli" = import ./vault-cli-test.nix { inherit pkgs repoRoot; };
  "ci-playwright" = import ./playwright.nix { inherit lib; };
  "ci-inspector-playwright" = import ./inspector-playwright.nix {
    inherit pkgs repoRoot playwrightBrowsers txInspectorUi inspectorSource protocolRegistry;
  };
  "ci-ux-capture" = import ./ux-capture.nix {
    inherit pkgs playwrightBrowsers txInspectorUi uxJudgeSource;
  };
  "ci-combined-site-smoke" = import ./combined-site-smoke.nix {
    inherit pkgs combinedSite webDist txInspectorUi;
  };
}

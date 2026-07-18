{ pkgs, repoRoot, playwrightBrowsers, txInspectorUi, inspectorSource, protocolRegistry }:

let
  runner = pkgs.writeShellApplication {
    name = "ci-inspector-playwright";
    runtimeInputs = [
      pkgs.coreutils
      pkgs.nodejs_22
      pkgs.playwright-test
      pkgs.python3
    ];
    text = ''
      work_tree=$(mktemp -d)
      cleanup() {
        chmod -R u+w "$work_tree" 2>/dev/null || true
        rm -rf "$work_tree"
      }
      trap cleanup EXIT

      mkdir -p "$work_tree/docs"
      cp -R ${repoRoot}/docs/inspector "$work_tree/docs/inspector"
      cp ${repoRoot}/package.json "$work_tree/package.json"
      chmod -R u+w "$work_tree"

      mkdir -p "$work_tree/specs/001-ledger-functional-layer"
      cp -R \
        ${inspectorSource}/specs/001-ledger-functional-layer/fixtures \
        "$work_tree/specs/001-ledger-functional-layer/fixtures"

      mkdir -p "$work_tree/docs/inspector/protocols"
      cp -R ${protocolRegistry}/. "$work_tree/docs/inspector/protocols/"

      cat > "$work_tree/playwright-globals.mjs" <<'EOF'
      import { readFileSync } from "node:fs";

      globalThis.cardanoShaclShapes = readFileSync(
        new URL("./docs/inspector/protocols/cardano-rdf/shapes.ttl", import.meta.url),
        "utf8",
      );
      EOF

      if [[ -z "''${PLAYWRIGHT_PORT:-}" ]]; then
        PLAYWRIGHT_PORT=$(python - <<'PY'
      import socket

      with socket.socket() as listener:
          listener.bind(("127.0.0.1", 0))
          print(listener.getsockname()[1])
      PY
        )
      fi
      export PLAYWRIGHT_PORT

      chmod -R u+w "$work_tree"
      cd "$work_tree/docs/inspector"
      ln -s \
        "$(dirname "$(dirname "$(readlink -f "$(command -v playwright)")")")/lib/node_modules" \
        node_modules

      TX_INSPECTOR_SITE_DIR=${txInspectorUi} \
        NODE_OPTIONS="--import=$work_tree/playwright-globals.mjs" \
        PLAYWRIGHT_BROWSERS_PATH=${playwrightBrowsers} \
        PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
        playwright test --reporter=list
    '';
  };
in
{
  type = "app";
  program = pkgs.lib.getExe runner;
  meta.description = "Run the transplanted inspector Playwright parity suites";
}

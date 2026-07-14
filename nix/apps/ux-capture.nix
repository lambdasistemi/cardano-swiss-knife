{ pkgs, playwrightBrowsers, txInspectorUi, uxJudgeSource }:

let
  runner = pkgs.writeShellApplication {
    name = "ci-ux-capture";
    runtimeInputs = [
      pkgs.coreutils
      pkgs.nodejs_22
      pkgs.playwright-test
      pkgs.python3
    ];
    text = ''
      work_tree=$(mktemp -d)
      server_pid=""
      cleanup() {
        if [[ -n "$server_pid" ]]; then
          kill "$server_pid" 2>/dev/null || true
          wait "$server_pid" 2>/dev/null || true
        fi
        chmod -R u+w "$work_tree" 2>/dev/null || true
        rm -rf "$work_tree"
      }
      trap cleanup EXIT

      mkdir -p "$work_tree/ux-judge" "$work_tree/site/inspector"
      cp -R ${uxJudgeSource}/. "$work_tree/ux-judge/"
      cp -R ${txInspectorUi}/. "$work_tree/site/inspector/"
      chmod -R u+w "$work_tree"

      ln -s \
        "$(dirname "$(dirname "$(readlink -f "$(command -v playwright)")")")/lib/node_modules" \
        "$work_tree/ux-judge/node_modules"

      if [[ -z "''${UX_CAPTURE_PORT:-}" ]]; then
        UX_CAPTURE_PORT=$(python - <<'PY'
      import socket

      with socket.socket() as listener:
          listener.bind(("127.0.0.1", 0))
          print(listener.getsockname()[1])
      PY
        )
      fi
      export UX_CAPTURE_PORT
      export UX_BASE_URL="http://127.0.0.1:$UX_CAPTURE_PORT/inspector/"

      python -m http.server "$UX_CAPTURE_PORT" \
        --bind 127.0.0.1 \
        --directory "$work_tree/site" \
        >"$work_tree/server.log" 2>&1 &
      server_pid=$!

      python - "$UX_BASE_URL" <<'PY'
      import sys
      import time
      import urllib.request

      url = sys.argv[1]
      deadline = time.monotonic() + 120
      while time.monotonic() < deadline:
          try:
              with urllib.request.urlopen(url, timeout=2) as response:
                  if response.status == 200:
                      break
          except Exception:
              time.sleep(0.25)
      else:
          raise SystemExit(f"local inspector server did not become ready: {url}")
      PY

      PLAYWRIGHT_BROWSERS_PATH=${playwrightBrowsers} \
        PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
        node "$work_tree/ux-judge/capture.mjs"

      python - "$work_tree/ux-judge/out" "$UX_BASE_URL" <<'PY'
      import json
      import pathlib
      import sys

      out = pathlib.Path(sys.argv[1])
      target = sys.argv[2]
      capture = json.loads((out / "capture.json").read_text())
      expected = {
          f"{scenario}@{viewport}"
          for viewport in ("desktop-1440", "laptop-1024", "mobile-390")
          for scenario in ("01-initial", "02-decoded-valid", "03-validation-broken")
      }
      results = capture.get("results", [])
      successful = [result for result in results if result.get("ok") is True]
      result_names = {result.get("name") for result in results}
      screenshots = list(out.glob("[0-9]*.png"))
      screenshot_names = {screenshot.stem for screenshot in screenshots}

      if capture.get("base") != target:
          raise SystemExit(f"capture target mismatch: {capture.get('base')!r} != {target!r}")
      if len(results) != 9 or len(successful) != 9 or result_names != expected:
          raise SystemExit(
              f"expected exactly 9 successful capture results, got "
              f"{len(successful)}/{len(results)} with names {sorted(result_names)}"
          )
      if len(screenshots) != 9 or screenshot_names != expected:
          raise SystemExit(
              f"expected exactly 9 screenshots, got {len(screenshots)} "
              f"with names {sorted(screenshot_names)}"
          )

      print(f"capture verified: 9 successful results, 9 screenshots; target={target}")
      PY
    '';
  };
in
{
  type = "app";
  program = pkgs.lib.getExe runner;
  meta.description = "Capture all UX judge scenarios against the built inspector workbench";
}

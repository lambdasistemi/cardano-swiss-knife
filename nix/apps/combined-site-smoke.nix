{ pkgs, combinedSite, webDist, txInspectorUi }:

let
  runner = pkgs.writeShellApplication {
    name = "ci-combined-site-smoke";
    runtimeInputs = [
      pkgs.coreutils
      pkgs.curl
      pkgs.diffutils
      pkgs.findutils
      pkgs.gnugrep
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
        rm -rf "$work_tree"
      }
      trap cleanup EXIT

      site=${combinedSite}
      port_file="$work_tree/port"
      server_log="$work_tree/server.log"

      diff -qr --exclude=inspector ${webDist} "$site"
      diff -qr ${txInspectorUi} "$site/inspector"
      echo "artifact comparison: root web-dist and inspector trees are byte-identical"

      test -f "$site/index.html"
      test -f "$site/app.js"
      test -f "$site/wasm/cardano-addresses.wasm"
      test -f "$site/wasm/wasm-tx-inspector.wasm"
      grep -q '<title>cardano-swiss-knife</title>' "$site/index.html"

      test -f "$site/inspector/index.html"
      test -f "$site/inspector/index.js"
      test -f "$site/inspector/material.js"
      test -f "$site/inspector/styles.css"
      grep -q '<title>Cardano transaction inspector</title>' "$site/inspector/index.html"

      shopt -s nullglob
      address_wasm=("$site"/inspector/cardano-addresses.*.wasm)
      inspector_wasm=("$site"/inspector/inspector.*.wasm)
      rdf_wasm=("$site"/inspector/rdf_shapes_wasm_bg.*.wasm)
      all_wasm=("$site"/inspector/*.wasm)
      all_wasm_gz=("$site"/inspector/*.wasm.gz)
      all_wasm_br=("$site"/inspector/*.wasm.br)

      [[ ''${#address_wasm[@]} -eq 1 ]]
      [[ ''${#inspector_wasm[@]} -eq 1 ]]
      [[ ''${#rdf_wasm[@]} -eq 1 ]]
      [[ ''${#all_wasm[@]} -eq 3 ]]
      [[ ''${#all_wasm_gz[@]} -eq 3 ]]
      [[ ''${#all_wasm_br[@]} -eq 3 ]]
      for wasm in "''${all_wasm[@]}"; do
        test -f "$wasm.gz"
        test -f "$wasm.br"
        test -f "${txInspectorUi}/$(basename "$wasm")"
        cmp "$wasm" "${txInspectorUi}/$(basename "$wasm")"
        cmp "$wasm.gz" "${txInspectorUi}/$(basename "$wasm").gz"
        cmp "$wasm.br" "${txInspectorUi}/$(basename "$wasm").br"
      done
      echo "WASM counts: base=''${#all_wasm[@]} gzip=''${#all_wasm_gz[@]} brotli=''${#all_wasm_br[@]}"

      python - "$site" "$port_file" >"$server_log" 2>&1 <<'PY' &
      import functools
      import http.server
      import pathlib
      import sys

      site = sys.argv[1]
      port_file = pathlib.Path(sys.argv[2])
      handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=site)
      with http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler) as server:
          port_file.write_text(str(server.server_port))
          server.serve_forever()
      PY
      server_pid=$!

      for _ in $(seq 1 100); do
        if [[ -s "$port_file" ]]; then
          break
        fi
        if ! kill -0 "$server_pid" 2>/dev/null; then
          cat "$server_log" >&2
          exit 1
        fi
        sleep 0.1
      done
      if [[ ! -s "$port_file" ]]; then
        cat "$server_log" >&2
        echo "combined-site server did not become ready" >&2
        exit 1
      fi

      base_url="http://127.0.0.1:$(<"$port_file")"
      routes=(
        "/"
        "/inspector/"
        "/inspector/inspect"
        "/inspector/settings"
        "/inspector/library"
        "/inspector/addresses"
        "/inspector/keys"
        "/inspector/scripts"
        "/inspector/vault"
      )
      expected_files=(
        "$site/index.html"
        "$site/inspector/index.html"
        "$site/inspector/inspect/index.html"
        "$site/inspector/settings/index.html"
        "$site/inspector/library/index.html"
        "$site/inspector/addresses/index.html"
        "$site/inspector/keys/index.html"
        "$site/inspector/scripts/index.html"
        "$site/inspector/vault/index.html"
      )

      for index in "''${!routes[@]}"; do
        response="$work_tree/route-$index"
        status=$(curl --silent --show-error --location \
          --output "$response" --write-out '%{http_code}' \
          "$base_url''${routes[$index]}")
        [[ "$status" == "200" ]]
        cmp "$response" "''${expected_files[$index]}"
        echo "route ''${routes[$index]} status=$status"
      done

      assets=(
        "/inspector/index.js"
        "/inspector/material.js"
        "/inspector/styles.css"
      )
      for wasm in "''${all_wasm[@]}"; do
        name=$(basename "$wasm")
        assets+=(
          "/inspector/$name"
          "/inspector/$name.gz"
          "/inspector/$name.br"
        )
      done
      for asset in "''${assets[@]}"; do
        status=$(curl --silent --show-error --output /dev/null \
          --write-out '%{http_code}' "$base_url$asset")
        [[ "$status" == "200" ]]
      done
      echo "inspector assets: all expected JS, CSS, WASM, gzip, and Brotli files returned HTTP 200"
    '';
  };
in
{
  type = "app";
  program = pkgs.lib.getExe runner;
  meta.description = "Smoke-test the combined root and inspector publication artifact";
}

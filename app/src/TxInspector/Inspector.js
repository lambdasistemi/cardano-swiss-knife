import { WASI, File, OpenFile, ConsoleStdout } from "@bjorn3/browser_wasi_shim";

let wasmModule = null;

const isNode =
  typeof process !== "undefined" &&
  process.versions != null &&
  process.versions.node != null;

const loadModule = async () => {
  if (wasmModule) return wasmModule;

  let bytes;
  if (isNode) {
    const { readFileSync } = await import("fs");
    const { resolve } = await import("path");
    bytes = readFileSync(
      resolve(process.env.TX_INSPECTOR_WASM_PATH || "dist/wasm/wasm-tx-inspector.wasm")
    );
  } else {
    const response = await fetch("wasm/wasm-tx-inspector.wasm");
    if (!response.ok) {
      throw new Error(`Failed to fetch tx inspector WASM: HTTP ${response.status}`);
    }
    bytes = await response.arrayBuffer();
  }

  wasmModule = await WebAssembly.compile(bytes);
  return wasmModule;
};

const runInspector = async (stdinText) => {
  const mod = await loadModule();
  const stdin = new OpenFile(new File(new TextEncoder().encode(stdinText)));
  const stdoutLines = [];
  const stderrLines = [];
  const stdout = ConsoleStdout.lineBuffered((line) => {
    stdoutLines.push(line);
  });
  const stderr = ConsoleStdout.lineBuffered((line) => {
    stderrLines.push(line);
  });

  const wasi = new WASI([], [], [stdin, stdout, stderr], { debug: false });
  const instance = await WebAssembly.instantiate(mod, {
    wasi_snapshot_preview1: wasi.wasiImport,
  });

  let exitOk = true;
  try {
    wasi.start(instance);
  } catch (err) {
    exitOk = false;
    stderrLines.push(String(err));
  }

  return {
    stdout: stdoutLines.join("\n"),
    stderr: stderrLines.join("\n"),
    exitOk,
  };
};

export const runLedgerOperationImpl = (txCbor) => (op) => (argsText) => async () => {
  let args = {};
  try {
    const parsed = JSON.parse(argsText);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      args = parsed;
    }
  } catch (_err) {
    args = {};
  }

  return runInspector(
    JSON.stringify({
      tx_cbor: String(txCbor || "").trim(),
      op,
      args,
    })
  );
};

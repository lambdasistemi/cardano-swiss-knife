import { WASI, File, OpenFile, ConsoleStdout } from "@bjorn3/browser_wasi_shim";

let wasmModule = null;

const isNode = typeof process !== "undefined" && process.versions != null && process.versions.node != null;

const loadModule = async () => {
  if (wasmModule) return wasmModule;
  let bytes;
  if (isNode) {
    const { readFileSync } = await import("fs");
    const { resolve } = await import("path");
    bytes = readFileSync(resolve(process.env.WASM_PATH || "dist/wasm/cardano-addresses.wasm"));
  } else {
    const response = await fetch("wasm/cardano-addresses.wasm");
    if (!response.ok) throw new Error("Failed to fetch WASM: HTTP " + response.status);
    bytes = await response.arrayBuffer();
  }
  wasmModule = await WebAssembly.compile(bytes);
  return wasmModule;
};

const callWasm = async (input) => {
  const mod = await loadModule();
  const encoder = new TextEncoder();
  const stdinData = encoder.encode(input);
  let stdoutBuf = "";
  let stderrBuf = "";
  const fds = [
    new OpenFile(new File(stdinData)),
    ConsoleStdout.lineBuffered((line) => { stdoutBuf += line + "\n"; }),
    ConsoleStdout.lineBuffered((line) => { stderrBuf += line + "\n"; }),
  ];
  const wasi = new WASI([], [], fds, { debug: false });
  const instance = await WebAssembly.instantiate(mod, { wasi_snapshot_preview1: wasi.wasiImport });
  wasi.start(instance);
  if (stdoutBuf) return stdoutBuf.trim();
  throw new Error(stderrBuf.trim() || "WASM produced no output");
};

// PureScript FFI exports (kept for Wasm.purs compatibility)
export const loadWasmModuleImpl = (onError) => (onSuccess) => (_url) => async () => {
  try {
    const mod = await loadModule();
    return onSuccess(mod);
  } catch (e) {
    return onError(e.message || "Failed to load WASM module");
  }
};

export const callWasmImpl = (onError) => (onSuccess) => (_wasmModule) => (input) => async () => {
  try {
    const result = await callWasm(input);
    return onSuccess(result);
  } catch (e) {
    return onError(e.message || "WASM execution failed");
  }
};

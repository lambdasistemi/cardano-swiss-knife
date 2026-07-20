import { WASI, File, OpenFile, ConsoleStdout } from "@bjorn3/browser_wasi_shim";

let wasmModule = null;

const isNode = typeof process !== "undefined" && process.versions?.node != null;

const engineError = (code, message, cause) => {
  const error = new Error(`[${code}] ${message}`);
  error.code = code;
  error.cause = cause;
  return error;
};

const loadModule = async () => {
  if (wasmModule) return wasmModule;
  let bytes;
  if (isNode) {
    const { readFile } = await import("node:fs/promises");
    const engineUrl = new URL("./cardano-addresses.wasm", import.meta.url);
    try {
      bytes = await readFile(engineUrl);
    } catch (error) {
      throw engineError("ENGINE_NOT_FOUND", "The packaged cardano-addresses engine was not found.", error);
    }
  } else {
    const response = await fetch(globalThis.cardanoAddressWasmUrl || "wasm/cardano-addresses.wasm");
    if (!response.ok) {
      throw engineError("ENGINE_NOT_FOUND", `Failed to fetch WASM: HTTP ${response.status}`);
    }
    bytes = await response.arrayBuffer();
  }
  let exitCode;
  try {
    wasmModule = await WebAssembly.compile(bytes);
    return wasmModule;
  } catch (error) {
    throw engineError("ENGINE_INCOMPATIBLE", "The cardano-addresses engine could not be compiled.", error);
  }
};

export const callWasm = async (input) => {
  const mod = await loadModule();
  const stdinData = new TextEncoder().encode(input);
  let stdoutBuf = "";
  let stderrBuf = "";
  const fds = [
    new OpenFile(new File(stdinData)),
    ConsoleStdout.lineBuffered((line) => { stdoutBuf += `${line}\n`; }),
    ConsoleStdout.lineBuffered((line) => { stderrBuf += `${line}\n`; }),
  ];
  try {
    const wasi = new WASI([], [], fds, { debug: false });
    const instance = await WebAssembly.instantiate(mod, { wasi_snapshot_preview1: wasi.wasiImport });
    exitCode = wasi.start(instance);
  } catch (error) {
    throw engineError("ENGINE_EXECUTION", "The cardano-addresses engine failed while executing.", error);
  }
  if (exitCode !== 0) {
    if (stdoutBuf) throw engineError("ENGINE_EXECUTION", `The cardano-addresses engine exited with status ${exitCode}.`);
    if (stderrBuf.trim()) throw new Error(stderrBuf.trim());
    throw engineError("ENGINE_EXECUTION", `The cardano-addresses engine exited with status ${exitCode}.`);
  }
  if (stdoutBuf) return stdoutBuf.trim();
  throw engineError("ENGINE_PROTOCOL", stderrBuf.trim() || "WASM produced no output");
};

export const parseWasmOutput = (output) => {
  try {
    return JSON.parse(output);
  } catch (error) {
    throw engineError("ENGINE_PROTOCOL", "The cardano-addresses engine produced malformed JSON.", error);
  }
};

export const loadWasmModuleImpl = (onError) => (onSuccess) => (_url) => async () => {
  try {
    return onSuccess(await loadModule());
  } catch (error) {
    return onError(error.message || "Failed to load WASM module");
  }
};

export const callWasmImpl = (onError) => (onSuccess) => (_wasmModule) => (input) => async () => {
  try {
    return onSuccess(await callWasm(input));
  } catch (error) {
    return onError(error.message || "WASM execution failed");
  }
};

import { readFile } from "node:fs/promises";
import { WASI, File, OpenFile, ConsoleStdout } from "@bjorn3/browser_wasi_shim";
import { CskError } from "./error.js";

const operations = new Set([
  "tx.inspect",
  "tx.browse",
  "tx.identify",
  "tx.intent",
  "tx.rdf",
  "tx.witness.plan",
  "tx.witness.attach",
  "tx.validate",
  "tx.evaluate.scripts",
]);
let wasmModule;

const engineError = (code, message, cause) => new CskError(code, message, cause);

const loadModule = async () => {
  if (wasmModule) return wasmModule;

  let bytes;
  try {
    bytes = await readFile(new URL("./wasm-tx-inspector.wasm", import.meta.url));
  } catch (error) {
    throw engineError("ENGINE_NOT_FOUND", "The packaged ledger-inspector engine was not found.", error);
  }

  try {
    wasmModule = await WebAssembly.compile(bytes);
    return wasmModule;
  } catch (error) {
    throw engineError("ENGINE_INCOMPATIBLE", "The packaged ledger-inspector engine could not be compiled.", error);
  }
};

const runEngine = async (request) => {
  const module = await loadModule();
  const stdoutLines = [];
  const stderrLines = [];
  const wasi = new WASI(
    [],
    [],
    [
      new OpenFile(new File(new TextEncoder().encode(JSON.stringify(request)))),
      ConsoleStdout.lineBuffered((line) => stdoutLines.push(line)),
      ConsoleStdout.lineBuffered((line) => stderrLines.push(line)),
    ],
    { debug: false },
  );

  let exitCode;
  try {
    const instance = await WebAssembly.instantiate(module, { wasi_snapshot_preview1: wasi.wasiImport });
    exitCode = wasi.start(instance);
  } catch (error) {
    throw engineError("ENGINE_EXECUTION", "The ledger-inspector engine failed while executing.", error);
  }

  if (exitCode !== 0) {
    throw engineError("ENGINE_EXECUTION", `The ledger-inspector engine exited with status ${exitCode}.`);
  }

  const stdout = stdoutLines.join("\n").trim();
  if (!stdout) {
    throw engineError("ENGINE_PROTOCOL", stderrLines.join("\n").trim() || "The ledger-inspector engine produced no output.");
  }

  try {
    return JSON.parse(stdout);
  } catch (error) {
    throw engineError("ENGINE_PROTOCOL", "The ledger-inspector engine produced malformed JSON.", error);
  }
};

export const runTransactionOperation = async (operation, txCbor, args = {}) => {
  if (!operations.has(operation)) {
    throw new CskError("DOMAIN_ERROR", `Unsupported transaction operation: ${operation}`);
  }

  return runEngine({ tx_cbor: txCbor, op: operation, args });
};

import { bech32 } from "bech32";
import { WASI, File, OpenFile, ConsoleStdout } from "@bjorn3/browser_wasi_shim";

let wasmModule = null;
const isNode = typeof process !== "undefined" && process.versions?.node != null;
const engineError = (code, message, cause) => Object.assign(new Error(`[${code}] ${message}`), { code, cause });
const loadModule = async () => {
  if (wasmModule) return wasmModule;
  let bytes;
  if (isNode) { try { bytes = await (await import("node:fs/promises")).readFile(new URL("./cardano-addresses.wasm", import.meta.url)); } catch (error) { throw engineError("ENGINE_NOT_FOUND", "The packaged cardano-addresses engine was not found.", error); } }
  else { const response = await fetch(globalThis.cardanoAddressWasmUrl || "wasm/cardano-addresses.wasm"); if (!response.ok) throw engineError("ENGINE_NOT_FOUND", `Failed to fetch WASM: HTTP ${response.status}`); bytes = await response.arrayBuffer(); }
  try { wasmModule = await WebAssembly.compile(bytes); return wasmModule; } catch (error) { throw engineError("ENGINE_INCOMPATIBLE", "The cardano-addresses engine could not be compiled.", error); }
};
const callWasm = async (input) => {
  const mod = await loadModule();
  const stdin = new TextEncoder().encode(input); let stdout = ""; let stderr = "";
  let exitCode;
  try { const wasi = new WASI([], [], [new OpenFile(new File(stdin)), ConsoleStdout.lineBuffered((line) => { stdout += `${line}\n`; }), ConsoleStdout.lineBuffered((line) => { stderr += `${line}\n`; })], { debug: false }); const instance = await WebAssembly.instantiate(mod, { wasi_snapshot_preview1: wasi.wasiImport }); exitCode = wasi.start(instance); }
  catch (error) { throw engineError("ENGINE_EXECUTION", "The cardano-addresses engine failed while executing.", error); }
  if (exitCode !== 0) { if (stdout.trim().startsWith("Error: ")) throw new Error(stdout.trim()); if (stdout) throw engineError("ENGINE_EXECUTION", `The cardano-addresses engine exited with status ${exitCode}.`); if (stderr.trim()) throw new Error(stderr.trim()); throw engineError("ENGINE_EXECUTION", `The cardano-addresses engine exited with status ${exitCode}.`); }
  if (stdout) return stdout.trim(); throw engineError("ENGINE_PROTOCOL", stderr.trim() || "WASM produced no output");
};
const parseWasmOutput = (output) => { try { return JSON.parse(output); } catch (error) { throw engineError("ENGINE_PROTOCOL", "The cardano-addresses engine produced malformed JSON.", error); } };

const hexToBytes = (hex) => Uint8Array.from(hex.match(/.{2}/g).map((byte) => parseInt(byte, 16)));
const toBech32 = (hrp, hexKey) => bech32.encode(hrp, bech32.toWords(hexToBytes(hexKey)), 1023);

export const derivePipelineImpl = (onError) => (onSuccess) => (mnemonic) => (accountIndex) => (role) => (addressIndex) => async () => {
  try {
    const keys = parseWasmOutput(await callWasm(JSON.stringify({ cmd: "derive", mnemonic, path: `1852H/1815H/${accountIndex}H/${role}/${addressIndex}` })));
    return onSuccess({
      rootKeyBech32: toBech32("root_xsk", keys.root_xsk),
      accountKeyBech32: toBech32("acct_xsk", keys.acct_xsk),
      addressKeyBech32: toBech32(role === 2 ? "stake_xsk" : "addr_xsk", keys.addr_xsk),
      addressPublicKeyBech32: toBech32(role === 2 ? "stake_xvk" : "addr_xvk", keys.addr_xvk),
      stakeKeyBech32: toBech32("stake_xsk", keys.stake_xsk),
      stakePublicKeyBech32: toBech32("stake_xvk", keys.stake_xvk),
    });
  } catch (error) {
    return onError(error.message || "Key derivation failed");
  }
};

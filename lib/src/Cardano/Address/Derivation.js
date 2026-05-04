import { WASI, File, OpenFile, ConsoleStdout } from "@bjorn3/browser_wasi_shim";
import { bech32 } from "bech32";

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

const hexToBytes = (hex) =>
  Uint8Array.from(hex.match(/.{2}/g).map((b) => parseInt(b, 16)));

const toBech32 = (hrp, hexKey) => {
  const bytes = hexToBytes(hexKey);
  return bech32.encode(hrp, bech32.toWords(bytes), 1023);
};

export const derivePipelineImpl = (onError) => (onSuccess) => (mnemonic) => (accountIndex) => (role) => (addressIndex) => async () => {
  try {
    const path = `1852H/1815H/${accountIndex}H/${role}/${addressIndex}`;
    const input = JSON.stringify({ cmd: "derive", mnemonic, path });
    const jsonStr = await callWasm(input);
    const keys = JSON.parse(jsonStr);

    return onSuccess({
      rootKeyBech32: toBech32("root_xsk", keys.root_xsk),
      accountKeyBech32: toBech32("acct_xsk", keys.acct_xsk),
      addressKeyBech32: toBech32(role === 2 ? "stake_xsk" : "addr_xsk", keys.addr_xsk),
      addressPublicKeyBech32: toBech32(role === 2 ? "stake_xvk" : "addr_xvk", keys.addr_xvk),
      stakeKeyBech32: toBech32("stake_xsk", keys.stake_xsk),
      stakePublicKeyBech32: toBech32("stake_xvk", keys.stake_xvk),
    });
  } catch (e) {
    return onError(e.message || "Key derivation failed");
  }
};

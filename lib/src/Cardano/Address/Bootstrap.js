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

const bytesToHex = (bytes) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

export const constructIcarusAddressImpl = (protocolMagic) => (xpub) => async () => {
  const jsonStr = await callWasm(JSON.stringify({
    cmd: "bootstrap-address",
    style: "icarus",
    protocol_magic: protocolMagic,
    xpub: bytesToHex(xpub),
  }));
  const result = JSON.parse(jsonStr);
  return result.address_base58;
};

export const constructByronAddressImpl = (protocolMagic) => (addressXPub) => (rootXPub) => (derivationPath) => async () => {
  const jsonStr = await callWasm(JSON.stringify({
    cmd: "bootstrap-address",
    style: "byron",
    protocol_magic: protocolMagic,
    xpub: bytesToHex(addressXPub),
    root_xpub: bytesToHex(rootXPub),
    derivation_path: derivationPath,
  }));
  const result = JSON.parse(jsonStr);
  return result.address_base58;
};

export const constructIcarusAddressFromMnemonicImpl = (protocolMagic) => (mnemonic) => (accountIndex) => (role) => (addressIndex) => async () => {
  const jsonStr = await callWasm(JSON.stringify({
    cmd: "bootstrap-address",
    style: "icarus-from-mnemonic",
    protocol_magic: protocolMagic,
    mnemonic,
    account_index: accountIndex,
    role,
    address_index: addressIndex,
  }));
  const result = JSON.parse(jsonStr);
  return result.address_base58;
};

export const constructByronAddressFromMnemonicImpl = (protocolMagic) => (mnemonic) => (accountIndex) => (addressIndex) => async () => {
  const jsonStr = await callWasm(JSON.stringify({
    cmd: "bootstrap-address",
    style: "byron-from-mnemonic",
    protocol_magic: protocolMagic,
    mnemonic,
    account_index: accountIndex,
    address_index: addressIndex,
  }));
  const result = JSON.parse(jsonStr);
  return result.address_base58;
};

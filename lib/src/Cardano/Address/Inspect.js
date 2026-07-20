import { WASI, File, OpenFile, ConsoleStdout } from "@bjorn3/browser_wasi_shim";

let wasmModule = null;
const isNode = typeof process !== "undefined" && process.versions?.node != null;
const engineError = (code, message, cause) => Object.assign(new Error(`[${code}] ${message}`), { code, cause });
const loadModule = async () => {
  if (wasmModule) return wasmModule;
  let bytes;
  if (isNode) {
    try { bytes = await (await import("node:fs/promises")).readFile(new URL("./cardano-addresses.wasm", import.meta.url)); }
    catch (error) { throw engineError("ENGINE_NOT_FOUND", "The packaged cardano-addresses engine was not found.", error); }
  } else {
    const response = await fetch(globalThis.cardanoAddressWasmUrl || "wasm/cardano-addresses.wasm");
    if (!response.ok) throw engineError("ENGINE_NOT_FOUND", `Failed to fetch WASM: HTTP ${response.status}`);
    bytes = await response.arrayBuffer();
  }
  try { wasmModule = await WebAssembly.compile(bytes); return wasmModule; }
  catch (error) { throw engineError("ENGINE_INCOMPATIBLE", "The cardano-addresses engine could not be compiled.", error); }
};
const callWasm = async (input) => {
  const mod = await loadModule();
  const stdin = new TextEncoder().encode(input); let stdout = ""; let stderr = "";
  let exitCode;
  try {
    const wasi = new WASI([], [], [new OpenFile(new File(stdin)), ConsoleStdout.lineBuffered((line) => { stdout += `${line}\n`; }), ConsoleStdout.lineBuffered((line) => { stderr += `${line}\n`; })], { debug: false });
    const instance = await WebAssembly.instantiate(mod, { wasi_snapshot_preview1: wasi.wasiImport });
    exitCode = wasi.start(instance);
  } catch (error) { throw engineError("ENGINE_EXECUTION", "The cardano-addresses engine failed while executing.", error); }
  if (exitCode !== 0) {
    if (stdout.trim().startsWith("Error: ")) throw new Error(stdout.trim());
    if (stdout) throw engineError("ENGINE_EXECUTION", `The cardano-addresses engine exited with status ${exitCode}.`);
    if (stderr.trim()) throw new Error(stderr.trim());
    throw engineError("ENGINE_EXECUTION", `The cardano-addresses engine exited with status ${exitCode}.`);
  }
  if (stdout) return stdout.trim();
  throw engineError("ENGINE_PROTOCOL", stderr.trim() || "WASM produced no output");
};
const parseWasmOutput = (output) => { try { return JSON.parse(output); } catch (error) { throw engineError("ENGINE_PROTOCOL", "The cardano-addresses engine produced malformed JSON.", error); } };

const addressTypeLabel = (type) => {
  const labels = {
    0: "Base address (key / key)", 1: "Base address (script / key)",
    2: "Base address (key / script)", 3: "Base address (script / script)",
    4: "Pointer address (key)", 5: "Pointer address (script)",
    6: "Enterprise address (key)", 7: "Enterprise address (script)",
    8: "Legacy address", 14: "Reward address (key)", 15: "Reward address (script)",
  };
  return labels[type] || `Unknown (${type})`;
};

const networkTagLabel = (tag, style) => {
  if (tag == null) return "No network tag";
  if (style === "Byron" || style === "Icarus") return tag < 0 ? "No network tag" : tag === 1 ? "Preprod" : tag === 2 ? "Preview" : tag === 764824073 ? "Mainnet (legacy)" : tag === 1097911063 ? "Legacy testnet" : tag === 633343913 ? "Legacy staging" : `Custom legacy network (${tag})`;
  return tag === 0 ? "Testnet-compatible (preview / preprod / custom)" : tag === 1 ? "Mainnet" : `Custom network (${tag})`;
};

const toAddressInfo = (json) => ({
  addressStyle: json.address_style,
  addressType: json.address_type ?? 8,
  addressTypeLabel: json.address_style === "Byron" || json.address_style === "Icarus" ? `${json.address_style} address` : addressTypeLabel(json.address_type ?? 8),
  networkTag: json.network_tag ?? -1,
  networkTagLabel: networkTagLabel(json.network_tag ?? -1, json.address_style),
  stakeReference: json.stake_reference || "none",
  spendingKeyHash: json.spending_key_hash ?? null,
  stakeKeyHash: json.stake_key_hash ?? null,
  spendingScriptHash: json.spending_script_hash ?? null,
  stakeScriptHash: json.stake_script_hash ?? null,
  extraDetails: json.address_root ? [{ label: "Address root", value: json.address_root }] : [],
});

export const inspectAddressWasmImpl = (onLeft) => (onRight) => (input) => async () => {
  try {
    if (!input || input.trim() === "") return onLeft("Paste a Cardano address to inspect.");
    const output = await callWasm(JSON.stringify({ cmd: "inspect", address: input.trim() }));
    return onRight(toAddressInfo(parseWasmOutput(output)));
  } catch (error) {
    return onLeft(error.message || "Failed to inspect address.");
  }
};

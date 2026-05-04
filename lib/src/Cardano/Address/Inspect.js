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

const addressTypeLabel = (type) => {
  switch (type) {
    case 0: return "Base address (key / key)";
    case 1: return "Base address (script / key)";
    case 2: return "Base address (key / script)";
    case 3: return "Base address (script / script)";
    case 4: return "Pointer address (key)";
    case 5: return "Pointer address (script)";
    case 6: return "Enterprise address (key)";
    case 7: return "Enterprise address (script)";
    case 8: return "Legacy address";
    case 14: return "Reward address (key)";
    case 15: return "Reward address (script)";
    default: return "Unknown (" + type + ")";
  }
};

const networkTagLabel = (tag, style) => {
  if (tag === null || tag === undefined) return "No network tag";
  if (style === "Byron" || style === "Icarus") {
    if (tag === 764824073) return "Mainnet (legacy)";
    if (tag === 1097911063) return "Legacy testnet";
    if (tag === 633343913) return "Legacy staging";
    return "Custom legacy network (" + tag + ")";
  }
  if (tag === 0) return "Testnet-compatible (preview / preprod / custom)";
  if (tag === 1) return "Mainnet";
  return "Custom network (" + tag + ")";
};

const legacyNetworkTagLabel = (tag) => {
  if (tag === null || tag === undefined || tag < 0) return "No network tag";
  if (tag === 1) return "Preprod";
  if (tag === 2) return "Preview";
  if (tag === 633343913) return "Legacy staging";
  if (tag === 1097911063) return "Legacy testnet";
  return "Custom legacy network (" + tag + ")";
};

const toAddressInfo = (json) => {
  const style = json.address_style;
  const type = json.address_type ?? 8;
  const networkTag = json.network_tag ?? -1;
  const isLegacy = style === "Byron" || style === "Icarus";

  const extraDetails = [];
  if (json.address_root) {
    extraDetails.push({ label: "Address root", value: json.address_root });
  }

  return {
    addressStyle: style,
    addressType: type,
    addressTypeLabel: isLegacy ? style + " address" : addressTypeLabel(type),
    networkTag: networkTag,
    networkTagLabel: isLegacy ? legacyNetworkTagLabel(networkTag) : networkTagLabel(networkTag, style),
    stakeReference: json.stake_reference || "none",
    spendingKeyHash: json.spending_key_hash ?? null,
    stakeKeyHash: json.stake_key_hash ?? null,
    spendingScriptHash: json.spending_script_hash ?? null,
    stakeScriptHash: json.stake_script_hash ?? null,
    extraDetails,
  };
};

export const inspectAddressWasmImpl = (onLeft) => (onRight) => (input) => async () => {
  try {
    if (!input || input.trim() === "") {
      return onLeft("Paste a Cardano address to inspect.");
    }
    console.log("[inspect] calling WASM with:", input.trim().slice(0, 20) + "...");
    const jsonStr = await callWasm(JSON.stringify({ cmd: "inspect", address: input.trim() }));
    console.log("[inspect] WASM returned:", jsonStr.slice(0, 80) + "...");
    const json = JSON.parse(jsonStr);
    const result = toAddressInfo(json);
    console.log("[inspect] mapped result:", JSON.stringify(result).slice(0, 80) + "...");
    return onRight(result);
  } catch (e) {
    console.error("[inspect] error:", e);
    return onLeft(e.message || "Failed to inspect address.");
  }
};

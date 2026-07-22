// Bootstrap: load @bjorn3/browser_wasi_shim, fetch the inspector WASM as a
// cacheable asset, and expose `runInspector(stdin: string) -> Promise<...>` on
// globalThis. The PureScript FFI then wraps this global in Aff.

import { WASI, File, OpenFile, ConsoleStdout }
  from "@bjorn3/browser_wasi_shim";
import * as rdfShapes from "./assets/rdf_shapes_wasm.js";
import inspectorWasmAssetUrl from "./assets/inspector.wasm";
import cardanoAddressWasmAssetUrl from "./assets/cardano-addresses.wasm";
import rdfShapesWasmAssetUrl from "./assets/rdf_shapes_wasm_bg.wasm";
import { inspectAddressWasmImpl } from "../../lib/src/Cardano/Address/Inspect.js";
import sundaeSwapV3Blueprint from "../protocols/sundaeswap-v3/plutus.json";
import sundaeswapV3Pin from "../protocols/sundaeswap-v3/pin.json";
import sundaeswapTreasuryV3Blueprint from "../protocols/sundaeswap-treasury-v3/plutus.json";
import sundaeswapTreasuryV3Pin from "../protocols/sundaeswap-treasury-v3/pin.json";
import protocolRegistry from "../protocols/registry.json";
import cardanoShaclShapes from "../protocols/cardano-rdf/shapes.ttl";
import amaruTreasuryJournal from "../protocols/amaru-treasury/journal-2026.json";
import * as rdfEditor from "purescript-rdf-editor";

const scriptBaseUrl = new URL(
  globalThis.document?.currentScript?.src ??
    globalThis.document?.baseURI ??
    globalThis.location?.href ??
    "http://localhost/"
);
const inspectorWasmUrl = resolveAssetUrl(inspectorWasmAssetUrl);
const cardanoAddressWasmUrl = resolveAssetUrl(cardanoAddressWasmAssetUrl);
const rdfShapesWasmUrl = resolveAssetUrl(rdfShapesWasmAssetUrl);

let compiledModulePromise = null;

globalThis.rdfShapes = rdfShapes;
globalThis.rdfShapesReady = rdfShapes.default(rdfShapesWasmUrl);
globalThis.cardanoAddressWasmUrl = cardanoAddressWasmUrl;
globalThis.inspectCardanoAddress = (address) =>
  inspectAddressWasmImpl(
    (error) => {
      throw new Error(error);
    }
  )((result) => result)(address)();
globalThis.rdfEditor = rdfEditor;
globalThis.sundaeSwapV3BlueprintJson = JSON.stringify(sundaeSwapV3Blueprint, null, 2);
globalThis.protocolRegistryJson = JSON.stringify(protocolRegistry, null, 2);
globalThis.protocolPinsJson = {
  "sundaeswap-v3/pin.json": JSON.stringify(sundaeswapV3Pin, null, 2),
  "sundaeswap-treasury-v3/pin.json": JSON.stringify(sundaeswapTreasuryV3Pin, null, 2),
};
globalThis.protocolBlueprintsJson = {
  "sundaeswap-v3/plutus.json": JSON.stringify(sundaeSwapV3Blueprint, null, 2),
  "sundaeswap-treasury-v3/plutus.json": JSON.stringify(sundaeswapTreasuryV3Blueprint, null, 2),
};
globalThis.cardanoShaclShapes = cardanoShaclShapes;
globalThis.amaruTreasuryJournalJson = JSON.stringify(amaruTreasuryJournal, null, 2);

globalThis.runInspector = async (stdinText) => {
  const stdin = new OpenFile(
    new File(new TextEncoder().encode(stdinText))
  );
  const stdoutLines = [];
  const stderrLines = [];
  const stdout = ConsoleStdout.lineBuffered((l) => stdoutLines.push(l));
  const stderr = ConsoleStdout.lineBuffered((l) => stderrLines.push(l));

  const wasi = new WASI([], [], [stdin, stdout, stderr]);
  const inst = await instantiateInspector({
    wasi_snapshot_preview1: wasi.wasiImport,
  });

  let exitOk = true;
  try {
    wasi.start(inst);
  } catch (err) {
    // WASI `proc_exit` manifests as a throw; the shim uses a non-zero exit
    // code to signal an abnormal termination. Inspect err.code if available.
    exitOk = false;
    stderrLines.push(String(err));
  }

  await globalThis.rdfShapesReady;

  return {
    stdout: stdoutLines.join("\n"),
    stderr: stderrLines.join("\n"),
    exitOk,
  };
};

function resolveAssetUrl(assetUrl) {
  return new URL(assetUrl, scriptBaseUrl).toString();
}

async function instantiateInspector(imports) {
  if (compiledModulePromise !== null) {
    const mod = await compiledModulePromise;
    return WebAssembly.instantiate(mod, imports);
  }

  if (WebAssembly.instantiateStreaming) {
    try {
      const result = await WebAssembly.instantiateStreaming(
        fetchInspectorWasm(),
        imports
      );
      compiledModulePromise = Promise.resolve(result.module);
      return result.instance;
    } catch (_err) {
      compiledModulePromise = compileInspectorWasm();
      const mod = await compiledModulePromise;
      return WebAssembly.instantiate(mod, imports);
    }
  }

  compiledModulePromise = compileInspectorWasm();
  const mod = await compiledModulePromise;
  return WebAssembly.instantiate(mod, imports);
}

async function compileInspectorWasm() {
  if (WebAssembly.compileStreaming) {
    try {
      return await WebAssembly.compileStreaming(fetchInspectorWasm());
    } catch (_err) {
      // Fall back for hosts that do not serve application/wasm.
    }
  }

  const response = await fetchInspectorWasm();
  return WebAssembly.compile(await response.arrayBuffer());
}

async function fetchInspectorWasm() {
  const response = await fetch(inspectorWasmUrl);
  if (!response.ok) {
    throw new Error(
      `failed to fetch inspector wasm: HTTP ${response.status}`
    );
  }
  return response;
}

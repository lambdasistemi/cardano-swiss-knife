import { readFile } from "node:fs/promises";
import { CskError } from "./error.js";
import { resolveLabels } from "../../lib/src/Cardano/Transaction/Rdf.js";
let engine;
const hard = (code, message, cause) => new CskError(code, message, cause);
const load = async () => {
  if (engine) return engine;
  let mod;
  try { mod = await import(new URL("./rdf_shapes_wasm.js", import.meta.url)); }
  catch (error) { throw hard("RDF_ENGINE_NOT_FOUND", "The packaged RDF-shapes engine was not found.", error); }
  let wasm;
  try { wasm = await readFile(new URL("./rdf_shapes_wasm_bg.wasm", import.meta.url)); }
  catch (error) { throw hard("RDF_ENGINE_NOT_FOUND", "The packaged RDF-shapes engine was not found.", error); }
  let compiled;
  try { compiled = await WebAssembly.compile(wasm); }
  catch (error) { throw hard("RDF_ENGINE_INCOMPATIBLE", "The packaged RDF-shapes engine could not be compiled.", error); }
  try { await mod.default(compiled); }
  catch (error) { throw hard("RDF_ENGINE_EXECUTION", "The packaged RDF-shapes engine failed while initializing.", error); }
  if (typeof mod.query !== "function") throw hard("RDF_ENGINE_PROTOCOL", "The RDF-shapes engine has no query operation.");
  engine = mod; return mod;
};
export const resolveRdf = async (graph, books) => {
  const mod = await load();
  let value;
  try { value = resolveLabels(mod, `${graph}\n${books.map((book) => book.turtle).join("\n")}`); }
  catch (error) {
    const protocol = /query did not return|query result missing|Cannot read properties/.test(String(error?.message));
    throw hard(protocol ? "RDF_ENGINE_PROTOCOL" : "RDF_ENGINE_EXECUTION", protocol ? "The RDF-shapes engine returned malformed query results." : "The RDF-shapes engine failed while resolving books.", error);
  }
  if (!Array.isArray(value)) throw hard("RDF_ENGINE_PROTOCOL", "The RDF-shapes engine returned malformed query results.");
  return value.map((row) => ({ raw: row.entity?.split(":").at(-1) ?? "", label: row.label, type: row.typeIri ? `overlay:${row.typeIri.split("#").at(-1)}` : "" }));
};

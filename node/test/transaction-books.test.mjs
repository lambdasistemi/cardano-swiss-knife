import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { after, before, test } from "node:test";

const run = promisify(execFile);
const packageName = "@lambdasistemi/cardano-swiss-knife";
const packedTarball = process.env.CSK_PACKAGE_TARBALL;
const transactionCbor = (await readFile(new URL("../../fixtures/conway-mainnet-tx.hex", import.meta.url), "utf8")).trim();
const books = JSON.parse(await readFile(new URL("./fixtures/transaction-books.json", import.meta.url), "utf8"));

assert.ok(packedTarball, "CSK_PACKAGE_TARBALL must name the prebuilt npm pack artifact");

let foreignProject;
const npmEnvironment = () => ({ ...process.env, HOME: foreignProject, npm_config_cache: join(foreignProject, ".npm-cache") });
const runForeignProgram = async (program) => {
  const script = join(foreignProject, "transaction-books-import.mjs");
  await writeFile(script, program);
  const { stdout } = await run(process.execPath, [script], { cwd: foreignProject });
  return JSON.parse(stdout);
};
const rdfEngine = () => join(foreignProject, "node_modules", "@lambdasistemi", "cardano-swiss-knife", "node", "dist", "rdf_shapes_wasm.js");
const rdfWasm = () => join(foreignProject, "node_modules", "@lambdasistemi", "cardano-swiss-knife", "node", "dist", "rdf_shapes_wasm_bg.wasm");

before(async () => {
  foreignProject = await mkdtemp(join(tmpdir(), "csk-transaction-books-"));
  await writeFile(join(foreignProject, "package.json"), '{"private":true,"type":"module"}\n');
  await run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--offline", packedTarball], { cwd: foreignProject, env: npmEnvironment() });
});
after(async () => { if (foreignProject) await rm(foreignProject, { recursive: true, force: true }); });

test("accepts ordered Turtle, CIP-57, and store documents transactionally", async () => {
  const result = await runForeignProgram(`
    import * as api from ${JSON.stringify(packageName)};
    const input = ${JSON.stringify({ cborHex: transactionCbor })};
    const books = ${JSON.stringify([books.turtle, books.cip57, books.store])};
    const accepted = await api.inspectTransaction(input, { books });
    const rejected = await api.inspectTransaction(input, { books: [...books, { kind: "amaru.book.bundle.v1", books: {} }] });
    console.log(JSON.stringify({ accepted, rejected }));
  `);
  assert.equal(result.accepted.ok, true, JSON.stringify(result.accepted));
  assert.deepEqual(result.accepted.value.books.map((book) => book.source), ["turtle", "CIP-57 plutus.json", "cardano-ledger-inspector.books.v1"]);
  assert.equal(result.rejected.ok, false);
  assert.equal(result.rejected.error.code, "BOOK_IMPORT");
});

test("preserves repeated book kinds in caller order", async () => {
  const secondTurtle = `@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
<urn:cardano:id:key:8bd03209d227956aaf9670751e0aa2057b51c1537a43f155b24fb1c1> rdfs:label "Second Turtle" .
`;
  const result = await runForeignProgram(`
    import * as api from ${JSON.stringify(packageName)};
    console.log(JSON.stringify(await api.inspectTransaction(${JSON.stringify({ cborHex: transactionCbor })}, {
      books: [${JSON.stringify(books.turtle)}, ${JSON.stringify(secondTurtle)}, ${JSON.stringify(books.cip57)}],
    })));
  `);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(result.value.books.map((book) => book.source), ["turtle", "turtle", "CIP-57 plutus.json"]);
  assert.equal(result.value.books[1].turtle.includes("Second Turtle"), true);
});

test("rejects bundle JSON without mutating the successful non-bundle import", async () => {
  const result = await runForeignProgram(`
    import * as api from ${JSON.stringify(packageName)};
    const input = ${JSON.stringify({ cborHex: transactionCbor })};
    const accepted = await api.inspectTransaction(input, { books: ${JSON.stringify([books.turtle, books.cip57, books.store])} });
    const rejected = await api.inspectTransaction(input, { books: [...${JSON.stringify([books.turtle, books.cip57, books.store])}, { kind: "amaru.book.bundle.v1", books: {} }] });
    console.log(JSON.stringify({ accepted, rejected }));
  `);
  assert.equal(result.accepted.ok, true, JSON.stringify(result.accepted));
  assert.deepEqual(result.accepted.value.books.map((book) => book.source), ["turtle", "CIP-57 plutus.json", "cardano-ledger-inspector.books.v1"]);
  assert.equal(result.rejected.ok, false);
  assert.equal(result.rejected.error.code, "BOOK_IMPORT");
  assert.deepEqual(result.rejected.value, undefined);
});

test("reports missing, incompatible, execution, and protocol RDF engines as typed hard failures", async () => {
  const engine = rdfEngine();
  const wasm = rdfWasm();
  const originalEngine = `${engine}.original`;
  const originalWasm = `${wasm}.original`;
  await rename(engine, originalEngine);
  await rename(wasm, originalWasm);
  try {
    const inspect = () => runForeignProgram(`
      import * as api from ${JSON.stringify(packageName)};
      console.log(JSON.stringify(await api.inspectTransaction(${JSON.stringify({ cborHex: transactionCbor })}, { books: [${JSON.stringify(books.store)}] })));
    `);
    const missing = await inspect();
    assert.equal(missing.ok, false);
    assert.equal(missing.error.code, "RDF_ENGINE_NOT_FOUND");

    await writeFile(engine, "export default async () => {}; export const query = () => [];");
    await writeFile(wasm, "not a WebAssembly binary");
    const incompatible = await inspect();
    assert.equal(incompatible.ok, false);
    assert.equal(incompatible.error.code, "RDF_ENGINE_INCOMPATIBLE");

    await writeFile(wasm, await readFile(originalWasm));
    await writeFile(engine, "export default async () => { throw new Error('engine exploded'); }; export const query = () => [];");
    const execution = await inspect();
    assert.equal(execution.ok, false);
    assert.equal(execution.error.code, "RDF_ENGINE_EXECUTION");

    await writeFile(engine, "export default async () => {}; export const query = () => 'not RDF query rows';");
    const protocol = await inspect();
    assert.equal(protocol.ok, false);
    assert.equal(protocol.error.code, "RDF_ENGINE_PROTOCOL");
  } finally {
    await rm(engine, { force: true });
    await rm(wasm, { force: true });
    await rename(originalEngine, engine);
    await rename(originalWasm, wasm);
  }
});

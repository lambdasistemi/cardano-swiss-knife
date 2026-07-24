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
const amaru = {
  scope_owners: "scope#000",
  treasuries: {
    alpha: {
      owner: "owner-alpha",
      budget: 42,
      address: "addr-alpha",
      treasury_script: { hash: "treasury-alpha", deployed_at: "tx#000" },
      permissions_script: { hash: "permissions-alpha", deployed_at: "tx#001" },
      registry_script: { hash: "registry-alpha", deployed_at: "tx#002" },
    },
  },
};

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
    const books = ${JSON.stringify([books.turtle, books.cip57, amaru, books.store])};
    const accepted = await api.inspectTransaction(input, { books });
    const rejected = await api.inspectTransaction(input, { books: [...books, { kind: "amaru.book.bundle.v1", books: {} }] });
    console.log(JSON.stringify({ accepted, rejected }));
  `);
  assert.equal(result.accepted.ok, true, JSON.stringify(result.accepted));
  assert.deepEqual(result.accepted.value.books.map((book) => book.source), ["turtle", "CIP-57 plutus.json", "docs/inspector/protocols/amaru-treasury/journal-2026.json", "cardano-ledger-inspector.books.v1"]);
  assert.equal(result.accepted.value.books[2].parts[0].id, "amaru-treasury-alpha");
  assert.match(result.accepted.value.books[2].turtle, /overlay:budgetAda 42/);
  assert.deepEqual(Object.keys(result.accepted.value.books[3]).sort(), ["source", "turtle"]);
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
    const accepted = await api.inspectTransaction(input, { books: ${JSON.stringify([books.turtle, books.cip57, amaru, books.store])} });
    const rejected = await api.inspectTransaction(input, { books: [...${JSON.stringify([books.turtle, books.cip57, amaru, books.store])}, { kind: "amaru.book.bundle.v1", books: {} }] });
    console.log(JSON.stringify({ accepted, rejected }));
  `);
  assert.equal(result.accepted.ok, true, JSON.stringify(result.accepted));
  assert.deepEqual(result.accepted.value.books.map((book) => book.source), ["turtle", "CIP-57 plutus.json", "docs/inspector/protocols/amaru-treasury/journal-2026.json", "cardano-ledger-inspector.books.v1"]);
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

const reviewBookTtl = (await readFile(new URL("./fixtures/tx-review-amaru-book.ttl", import.meta.url), "utf8"));
const sentinelTtl = `@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
<urn:cardano:id:PaymentKey:deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef> rdfs:label "Sentinel not in transaction" .
`;
const userBookTtl = `@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
<urn:cardano:id:PaymentKey:8bd03209d227956aaf9670751e0aa2057b51c1537a43f155b24fb1c1> rdfs:label "User book signer label" .
`;

test("reviewTransaction resolves ordered protocol and user book paths with transaction-scoped filtering", async () => {
  const protocolBookPath = join(foreignProject, "protocol-book.ttl");
  const userBookPath = join(foreignProject, "user-book.ttl");
  const sentinelBookPath = join(foreignProject, "sentinel-book.ttl");
  await writeFile(protocolBookPath, reviewBookTtl);
  await writeFile(userBookPath, userBookTtl);
  await writeFile(sentinelBookPath, sentinelTtl);

  const result = await runForeignProgram(`
    import * as api from ${JSON.stringify(packageName)};
    console.log(JSON.stringify(await api.reviewTransaction(${JSON.stringify({ cborHex: transactionCbor })}, {
      protocolBooks: [${JSON.stringify(protocolBookPath)}, ${JSON.stringify(sentinelBookPath)}],
      userBooks: [${JSON.stringify(userBookPath)}],
    })));
  `);

  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.value.op, "tx.review");
  assert.ok(Array.isArray(result.value.resolutions), "resolutions must be an array when books are supplied");
  assert.equal(Object.hasOwn(result.value, "books"), false, "reviewTransaction must not return imported books");

  const labels = result.value.resolutions.map((row) => row.label);
  assert.ok(labels.includes("Amaru treasury signer"), "protocol book label for a transaction signer must resolve");
  assert.ok(labels.includes("User book signer label"), "user book label for a transaction signer must resolve");
  assert.equal(labels.includes("Sentinel not in transaction"), false, "off-transaction sentinel label must not appear");
});

test("reviewTransaction returns typed BOOK_IMPORT failures for unreadable and invalid book paths", async () => {
  const invalidBookPath = join(foreignProject, "invalid-book.ttl");
  await writeFile(invalidBookPath, "this is not valid Turtle {{{{");

  const missing = await runForeignProgram(`
    import * as api from ${JSON.stringify(packageName)};
    console.log(JSON.stringify(await api.reviewTransaction(${JSON.stringify({ cborHex: transactionCbor })}, {
      protocolBooks: ["/nonexistent/path/book.ttl"],
    })));
  `);
  assert.equal(missing.ok, false, JSON.stringify(missing));
  assert.equal(missing.error.code, "BOOK_IMPORT");
  assert.equal(Object.hasOwn(missing, "value"), false, "failed review must not carry a partial value");

  const invalid = await runForeignProgram(`
    import * as api from ${JSON.stringify(packageName)};
    console.log(JSON.stringify(await api.reviewTransaction(${JSON.stringify({ cborHex: transactionCbor })}, {
      userBooks: [${JSON.stringify(invalidBookPath)}],
    })));
  `);
  assert.equal(invalid.ok, false, JSON.stringify(invalid));
  assert.equal(invalid.error.code, "BOOK_IMPORT");
});

test("resolveReviewLabels performs the transaction-term join inside the supplied RDF engine, not in host JavaScript", async () => {
  const source = await readFile(new URL("../../lib/src/Cardano/Transaction/Rdf.js", import.meta.url), "utf8");
  const fnStart = source.indexOf("export const resolveReviewLabels");
  assert.ok(fnStart >= 0, "resolveReviewLabels must be exported from Rdf.js");
  const fnBody = source.slice(fnStart, source.indexOf("\nexport const", fnStart + 1) === -1 ? undefined : source.indexOf("\nexport const", fnStart + 1));

  assert.ok(fnBody.includes("rdfShapes.query"), "resolveReviewLabels must call query on the supplied engine handle");
  assert.equal(fnBody.includes("globalThis.rdfShapes"), false, "resolveReviewLabels must not read globalThis.rdfShapes");
  assert.equal(fnBody.includes(".filter("), false, "resolveReviewLabels must not filter rows in host JavaScript");
  assert.equal(fnBody.includes("new Set("), false, "resolveReviewLabels must not build a host-side hash set");
  assert.equal(fnBody.includes("transactionTermHashes"), false, "resolveReviewLabels must not call a separate host-side term-hash stage");
});

test("transactionInputOutRefs uses a collateral-free engine query on the supplied handle, not host-side derivation", async () => {
  const source = await readFile(new URL("../../lib/src/Cardano/Transaction/Rdf.js", import.meta.url), "utf8");
  const fnStart = source.indexOf("export const transactionInputOutRefs");
  assert.ok(fnStart >= 0, "transactionInputOutRefs must be exported from Rdf.js");
  const fnBody = source.slice(fnStart, source.indexOf("\nexport const", fnStart + 1) === -1 ? undefined : source.indexOf("\nexport const", fnStart + 1));

  assert.ok(fnBody.includes("rdfShapes.query"), "transactionInputOutRefs must call query on the supplied engine handle");
  assert.equal(fnBody.includes("globalThis.rdfShapes"), false, "transactionInputOutRefs must not read globalThis.rdfShapes");
  assert.equal(fnBody.includes("decodedInputsQuery"), false, "transactionInputOutRefs must not reuse the collateral-including decodedInputsQuery");

  const queryStart = source.indexOf("const producerOutRefsQuery");
  assert.ok(queryStart >= 0, "producerOutRefsQuery must exist");
  const queryBody = source.slice(queryStart, source.indexOf("export const transactionInputOutRefs"));
  assert.ok(queryBody.includes("cardano:hasInput"), "producer query must select regular inputs");
  assert.ok(queryBody.includes("cardano:hasReferenceInput"), "producer query must select reference inputs");
  assert.equal(queryBody.includes("cardano:hasCollateralInput"), false, "producer query must not select collateral inputs for host-side dropping");

  const outrefFnBody = source.slice(source.indexOf("export const transactionInputOutRefs"));
  assert.equal(outrefFnBody.includes("continue"), false, "transactionInputOutRefs must not drop rows in host JavaScript");

  const indexSource = await readFile(new URL("../src/index.js", import.meta.url), "utf8");
  const reviewStart = indexSource.indexOf("export const reviewTransaction");
  assert.ok(reviewStart >= 0, "reviewTransaction must be exported from index.js");
  const reviewBody = indexSource.slice(reviewStart);
  const countOccurrences = (haystack, needle) => haystack.split(needle).length - 1;
  assert.equal(countOccurrences(reviewBody, 'runTransactionOperation("tx.review"'), 1, "reviewTransaction must dispatch exactly one tx.review");
  assert.equal(countOccurrences(reviewBody, 'runTransactionOperation("tx.inspect"'), 0, "reviewTransaction must not dispatch tx.inspect");
  assert.equal(countOccurrences(reviewBody, 'runTransactionOperation("tx.intent"'), 0, "reviewTransaction must not dispatch tx.intent");
  assert.equal(countOccurrences(reviewBody, 'runTransactionOperation(TransactionLedger.planTransactionWitnessesOperation'), 0, "reviewTransaction must not dispatch tx.witness.plan");
  assert.equal(countOccurrences(reviewBody, 'runTransactionOperation(TransactionLedger.validateTransactionOperation'), 0, "reviewTransaction must not dispatch tx.validate");
});

test("reviewTransaction resolves cross-prefix book entities by engine-owned hash join, not host IRI comparison", async () => {
  const crossPrefixTtl = `@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
<urn:cardano:id:Script:8bd03209d227956aaf9670751e0aa2057b51c1537a43f155b24fb1c1> rdfs:label "Cross-prefix signer label" .
`;
  const crossPrefixPath = join(foreignProject, "cross-prefix-book.ttl");
  await writeFile(crossPrefixPath, crossPrefixTtl);

  const result = await runForeignProgram(`
    import * as api from ${JSON.stringify(packageName)};
    console.log(JSON.stringify(await api.reviewTransaction(${JSON.stringify({ cborHex: transactionCbor })}, {
      userBooks: [${JSON.stringify(crossPrefixPath)}],
    })));
  `);

  assert.equal(result.ok, true, JSON.stringify(result));
  const labels = result.value.resolutions.map((row) => row.label);
  assert.ok(labels.includes("Cross-prefix signer label"), "engine hash join must match across differing URI prefixes; host IRI comparison would miss this");
});

test("reviewTransaction preserves exact protocol-then-user book order in resolutions with duplicates and no dedup", async () => {
  const signerHash = "8bd03209d227956aaf9670751e0aa2057b51c1537a43f155b24fb1c1";
  const book = (label) => `@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\n<urn:cardano:id:PaymentKey:${signerHash}> rdfs:label "${label}" .\n`;
  const p1Path = join(foreignProject, "order-p1.ttl");
  const p2Path = join(foreignProject, "order-p2.ttl");
  const u1Path = join(foreignProject, "order-u1.ttl");
  const u2Path = join(foreignProject, "order-u2.ttl");
  await writeFile(p1Path, book("P1"));
  await writeFile(p2Path, book("P2"));
  await writeFile(u1Path, book("U1"));
  await writeFile(u2Path, book("U2"));

  const forward = await runForeignProgram(`
    import * as api from ${JSON.stringify(packageName)};
    console.log(JSON.stringify(await api.reviewTransaction(${JSON.stringify({ cborHex: transactionCbor })}, {
      protocolBooks: [${JSON.stringify(p1Path)}, ${JSON.stringify(p2Path)}],
      userBooks: [${JSON.stringify(u1Path)}, ${JSON.stringify(u2Path)}],
    })));
  `);
  assert.equal(forward.ok, true, JSON.stringify(forward));
  const forwardSignerLabels = forward.value.resolutions
    .filter((row) => row.raw === signerHash)
    .map((row) => row.label);
  assert.deepEqual(forwardSignerLabels, ["P1", "P2", "U1", "U2"], "exact resolution sequence must follow protocol-then-user book order with duplicates preserved");

  const reversed = await runForeignProgram(`
    import * as api from ${JSON.stringify(packageName)};
    console.log(JSON.stringify(await api.reviewTransaction(${JSON.stringify({ cborHex: transactionCbor })}, {
      protocolBooks: [${JSON.stringify(u2Path)}, ${JSON.stringify(u1Path)}],
      userBooks: [${JSON.stringify(p2Path)}, ${JSON.stringify(p1Path)}],
    })));
  `);
  assert.equal(reversed.ok, true, JSON.stringify(reversed));
  const reversedSignerLabels = reversed.value.resolutions
    .filter((row) => row.raw === signerHash)
    .map((row) => row.label);
  assert.deepEqual(reversedSignerLabels, ["U2", "U1", "P2", "P1"], "reversing caller book order must reverse the exact resolution sequence");
});

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const packageName = "@lambdasistemi/cardano-swiss-knife";
const tarball = process.env.CSK_PACKAGE_TARBALL;
const vectors = JSON.parse(await readFile(new URL("../../test-vectors/vectors.json", import.meta.url), "utf8"));
const mnemonic = vectors.derivationVectors[0].mnemonic.join(" ");
const signing = vectors.signingVectors[0];
const witnessFixture = JSON.parse(await readFile(new URL("./fixtures/transaction-witnesses.json", import.meta.url), "utf8"));
const transactionCbor = (await readFile(new URL("../../docs/inspector/tests/fixtures/treasury-reorganize-unsigned-tx.hex", import.meta.url), "utf8")).trim();
const textEnvelope = JSON.stringify({ type: "Tx ConwayEra", description: "Ledger Cddl Format", cborHex: transactionCbor });
const npmExecPath = process.env.npm_execpath;
const hexToBytes = (hex) => Uint8Array.from(hex.match(/../g).map((chunk) => Number.parseInt(chunk, 16)));
const hex = (bytes) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
const skipCbor = (bytes, start) => {
  const additional = bytes[start] & 0x1f; const major = bytes[start] >> 5;
  const length = additional < 24 ? additional : additional === 24 ? bytes[start + 1] : additional === 25 ? (bytes[start + 1] << 8) | bytes[start + 2] : additional === 26 ? bytes[start + 1] * 0x1000000 + (bytes[start + 2] << 16) + (bytes[start + 3] << 8) + bytes[start + 4] : additional === 27 ? Number(bytes.slice(start + 1, start + 9).reduce((value, byte) => (value << 8n) | BigInt(byte), 0n)) : additional === 31 ? null : (() => { throw Error("fixture CBOR is unsupported"); })();
  const body = start + (additional < 24 ? 1 : additional === 24 ? 2 : additional === 25 ? 3 : additional === 26 ? 5 : additional === 27 ? 9 : 1);
  if (major === 0 || major === 1 || major === 7) return body;
  if (major === 2 || major === 3) { if (length !== null) return body + length; let offset = body; while (bytes[offset] !== 0xff) offset = skipCbor(bytes, offset); return offset + 1; }
  if (major === 6) return skipCbor(bytes, body);
  let offset = body; const items = major === 5 && length !== null ? length * 2 : length;
  if (items === null) { while (bytes[offset] !== 0xff) offset = skipCbor(bytes, offset); return offset + 1; }
  for (let index = 0; index < items; index += 1) offset = skipCbor(bytes, offset); return offset;
};
const withoutRequiredSigner = (transaction) => {
  const bytes = hexToBytes(transaction); const entries = bytes[1] & 0x1f; let offset = 2;
  for (let index = 0; index < entries; index += 1) { const keyOffset = offset; const key = bytes[keyOffset]; offset = skipCbor(bytes, keyOffset); const valueEnd = skipCbor(bytes, offset); if (key === 14) { const patched = new Uint8Array(bytes.length - (valueEnd - keyOffset)); patched.set(bytes.slice(0, keyOffset)); patched[1] -= 1; patched.set(bytes.slice(valueEnd), keyOffset); return hex(patched); } offset = valueEnd; }
  return transaction;
};
const withRequiredSigner = (transaction, signerHash) => {
  const bytes = hexToBytes(withoutRequiredSigner(transaction)); const entries = bytes[1] & 0x1f; let offset = 2;
  for (let index = 0; index < entries; index += 1) { offset = skipCbor(bytes, skipCbor(bytes, offset)); }
  const required = Uint8Array.from([0x0e, 0x81, 0x58, 0x1c, ...hexToBytes(signerHash)]);
  const patched = new Uint8Array(bytes.length + required.length); patched.set(bytes.slice(0, offset)); patched[1] += 1; patched.set(required, offset); patched.set(bytes.slice(offset), offset + required.length); return hex(patched);
};

const run = (command, args, options = {}) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { ...options, stdio: ["pipe", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.on("error", reject);
  child.on("close", (code) => resolve({ code, stdout, stderr }));
  child.stdin.end(options.input || "");
});

const filesBelow = async (root) => {
  const paths = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) paths.push(...await filesBelow(path));
    else paths.push(path);
  }
  return paths;
};

test("installs a prepacked artifact outside the checkout without network, native hooks, or secret leakage", async () => {
  assert.ok(tarball, "CSK_PACKAGE_TARBALL must name the prebuilt npm pack artifact");
  assert.ok(npmExecPath, "npm_execpath must name npm's JavaScript entrypoint; run this smoke through npm run");
  const foreignProject = await mkdtemp(join(tmpdir(), "csk-package-smoke-"));
  try {
    await writeFile(join(foreignProject, "package.json"), '{"private":true,"type":"module"}\n');
    const installed = await run(process.execPath, [npmExecPath, "install", "--ignore-scripts", "--no-audit", "--no-fund", "--offline", tarball], {
      cwd: foreignProject,
      env: { ...process.env, HOME: foreignProject, npm_config_cache: join(foreignProject, ".npm-cache") },
    });
    assert.equal(installed.code, 0, installed.stderr);

    const packageRoot = join(foreignProject, "node_modules", "@lambdasistemi", "cardano-swiss-knife");
    const packageJson = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
    assert.deepEqual(packageJson.dependencies || {}, {}, "packed artifact must bundle all runtime JavaScript");
    assert.deepEqual(packageJson.optionalDependencies || {}, {}, "packed artifact must have no platform-specific optional dependencies");
    for (const hook of ["preinstall", "install", "postinstall", "prepare", "prepublish", "prepublishOnly"]) {
      assert.equal(packageJson.scripts?.[hook], undefined, `packed package declares ${hook}`);
    }
    for (const path of await filesBelow(join(foreignProject, "node_modules"))) {
      assert.equal(path.endsWith(".node"), false, `native addon packaged: ${path}`);
      const contents = await readFile(path);
      assert.equal(contents.includes("node-gyp"), false, `native build reference packaged: ${path}`);
      assert.equal(contents.includes(mnemonic), false, `mnemonic leaked into package: ${path}`);
      assert.equal(contents.includes(signing.signingKeyBech32), false, `private key leaked into package: ${path}`);
    }
    const packagedFiles = await filesBelow(packageRoot);
    for (const engine of [
      "cardano-addresses.wasm",
      "wasm-tx-inspector.wasm",
      "rdf_shapes_wasm.js",
      "rdf_shapes_wasm_bg.wasm",
    ]) {
      assert.deepEqual(
        packagedFiles.filter((path) => path.endsWith(engine)).length,
        1,
        `package must contain exactly one ${engine}`,
      );
    }
    // Shipped book/blueprint/registry assets must be package-relative (FR-012).
    for (const asset of [
      "registry.json",
      "shapes.ttl",
      "journal-2026.json",
      "sundaeswap-v3/plutus.json",
      "sundaeswap-v3/pin.json",
      "sundaeswap-treasury-v3/plutus.json",
      "sundaeswap-treasury-v3/pin.json",
    ]) {
      assert.deepEqual(
        packagedFiles.filter((path) => path.endsWith(asset)).length,
        1,
        `package must contain exactly one shipped book/registry asset ${asset}`,
      );
    }
    assert.equal(packagedFiles.some((path) => /plutus/i.test(path) && path.endsWith(".wasm")), false, "package must not contain a fallback Plutus engine");
    const installedApi = await import(pathToFileURL(join(packageRoot, "node", "dist", "index.js")).href);
    const witnessTransaction = { cborHex: withRequiredSigner(transactionCbor, witnessFixture.requiredSignerHash) };
    const witnessIdentification = await installedApi.identifyTransaction(witnessTransaction);
    const preparedWitness = await installedApi.prepareTransactionWitness({ bodyHashHex: witnessIdentification.value.result.identification.body_hash, signingKeyBech32: witnessFixture.signingKey });
    assert.equal(preparedWitness.ok, true, JSON.stringify(preparedWitness));
    await writeFile(join(foreignProject, "detached.json"), JSON.stringify(preparedWitness.value.textEnvelope));
    await writeFile(join(foreignProject, "witness-transaction.cbor"), `${witnessTransaction.cborHex}\n`);

    const networkGuard = join(foreignProject, "network-denied.mjs");
    await writeFile(networkGuard, `
      import net from "node:net";
      import http from "node:http";
      import https from "node:https";
      import tls from "node:tls";
      import dgram from "node:dgram";
      import dns from "node:dns";
      import { syncBuiltinESMExports } from "node:module";
      const denied = (name) => () => { throw new Error("outbound network attempted via " + name); };
      net.connect = denied("net.connect"); net.createConnection = denied("net.createConnection");
      http.request = denied("http.request"); http.get = denied("http.get");
      https.request = denied("https.request"); https.get = denied("https.get");
      tls.connect = denied("tls.connect"); dgram.createSocket = denied("dgram.createSocket");
      dns.lookup = denied("dns.lookup"); dns.resolve = denied("dns.resolve");
      globalThis.fetch = denied("fetch"); syncBuiltinESMExports();
    `);
    const networkGuardUrl = pathToFileURL(networkGuard).href;
    const program = join(foreignProject, "foreign-program.mjs");
    await writeFile(program, `
      import { readFile } from "node:fs/promises";
      let runtimeText = "";
      for await (const chunk of process.stdin) runtimeText += chunk;
      const runtime = JSON.parse(runtimeText);
      const secrets = [runtime.signing.signingKeyBech32];
      if (secrets.some((secret) => process.argv.includes(secret) || Object.values(process.env).includes(secret))) throw new Error("secret leaked through argv or environment");
      const api = await import(${JSON.stringify(packageName)});
      const vectors = ${JSON.stringify({ inspection: vectors.inspectionVectors[0] })};
      const inspection = await api.inspectAddress(vectors.inspection.address);
      const derivation = await api.deriveKeys({ mnemonic: runtime.derivation.mnemonic, accountIndex: runtime.derivation.accountIndex, role: runtime.derivation.role, addressIndex: runtime.derivation.addressIndex });
      const signed = await api.signPayload({ payloadMode: runtime.signing.payloadMode, payloadInput: runtime.signing.payloadInput, signingKeyBech32: runtime.signing.signingKeyBech32 });
      const verified = await api.verifySignature({ payloadMode: runtime.signing.payloadMode, payloadInput: runtime.signing.payloadInput, verificationKeyBech32: runtime.signing.verificationKeyBech32, signatureHex: signed.value.signatureHex });
      const transaction = ${JSON.stringify({ cborHex: transactionCbor })};
      const witnessTransaction = ${JSON.stringify(witnessTransaction)};
      const envelope = ${JSON.stringify({ textEnvelope })};
      const books = ["@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> ."];
      const transactions = await Promise.all([
        api.inspectTransaction(transaction, { books }), api.browseTransaction(transaction, { path: ["body", "fee"], books }), api.identifyTransaction(transaction, { books }), api.transactionIntent(transaction, { books }),
        api.inspectTransaction(envelope, { books }), api.browseTransaction(envelope, { path: ["body", "fee"], books }), api.identifyTransaction(envelope, { books }), api.transactionIntent(envelope, { books }),
      ]);
      const ledger = await Promise.all([api.planTransactionWitnesses(transaction), api.validateTransaction(transaction), api.evaluateTransactionScripts(transaction)]);
      const detached = JSON.parse(await readFile("detached.json", "utf8"));
      const attachment = await api.attachTransactionWitness(witnessTransaction, { textEnvelope: detached });
      console.log(JSON.stringify({ inspection, derivation, signed: signed.ok, verified, transactions, ledger, attachment }));
    `);
    const api = await run(process.execPath, ["--import", networkGuardUrl, program], { cwd: foreignProject, input: JSON.stringify({ signing, derivation: vectors.derivationVectors[0] }) });
    assert.equal(api.code, 0, api.stderr);
    const result = JSON.parse(api.stdout);
    assert.equal(result.inspection.ok, true);
    assert.equal(result.derivation.ok, true);
    assert.equal(result.signed, true);
    assert.deepEqual(result.verified, { ok: true, value: true });
    for (const transaction of result.transactions) assert.equal(transaction.ok, true, JSON.stringify(transaction));
    for (const transaction of result.ledger) assert.equal(transaction.ok, true, JSON.stringify(transaction));
    assert.equal(result.attachment.ok, true, JSON.stringify(result.attachment));

    const cli = join(packageRoot, "node", "dist", "csk.mjs");
    await writeFile(join(foreignProject, "transaction.json"), textEnvelope);
    await writeFile(join(foreignProject, "transaction.cbor"), `${transactionCbor}\n`);
    await writeFile(join(foreignProject, "book.ttl"), "@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\n");
    const providerCapture = join(foreignProject, "provider-capture.json");
    const providerGuard = join(foreignProject, "provider-guard.mjs");
    await writeFile(providerGuard, `import { writeFileSync } from "node:fs"; const calls = []; globalThis.fetch = async (url) => { calls.push({ url }); return { status: 401, text: async () => "provider denied" }; }; process.on("exit", () => writeFileSync(process.env.CSK_PROVIDER_CAPTURE, JSON.stringify({ calls, argv: process.argv, env: process.env })));`);
    const providerGuardUrl = pathToFileURL(providerGuard).href;
    const command = await run(process.execPath, ["--import", networkGuardUrl, cli, "payload", "sign", "--secret-stdin", "--payload-mode", signing.payloadMode, "--payload-input", signing.payloadInput, "--output", "json"], {
      cwd: foreignProject,
      input: `${signing.signingKeyBech32}\n`,
    });
    assert.equal(command.code, 0, command.stderr);
    assert.equal(JSON.parse(command.stdout).ok, true);
    assert.equal(`${command.stdout}${command.stderr}`.includes(mnemonic), false);
    assert.equal(`${command.stdout}${command.stderr}`.includes(signing.signingKeyBech32), false);

    for (const source of [["--cbor-hex", transactionCbor], ["--tx-file", join(foreignProject, "transaction.cbor")], ["--tx-file", join(foreignProject, "transaction.json")]]) for (const [operation, extra = []] of [["inspect"], ["browse", ["--path", '["body","fee"]']], ["identify"], ["intent"]]) {
      const txCommand = await run(process.execPath, ["--import", networkGuardUrl, cli, "tx", operation, ...source, "--book", join(foreignProject, "book.ttl"), ...extra, "--output", "json"], { cwd: foreignProject });
      assert.equal(txCommand.code, 0, txCommand.stderr);
      assert.equal(JSON.parse(txCommand.stdout).ok, true);
    }

    for (const [args, field, expected] of [
      [["tx", "witness", "plan", "--tx-file", join(foreignProject, "transaction.cbor"), "--output", "json"], "witness_plan", result.ledger[0].value.result.witness_plan],
      [["tx", "validate", "--tx-file", join(foreignProject, "transaction.cbor"), "--output", "json"], "validation", result.ledger[1].value.result.validation],
      [["tx", "evaluate-scripts", "--tx-file", join(foreignProject, "transaction.cbor"), "--output", "json"], "script_evaluation", result.ledger[2].value.result.script_evaluation],
    ]) {
      const cliLedger = await run(process.execPath, ["--import", networkGuardUrl, cli, ...args], { cwd: foreignProject });
      assert.equal(cliLedger.code, 0, cliLedger.stderr);
      assert.deepEqual(JSON.parse(cliLedger.stdout).value.result[field], expected, `CLI ${field} must preserve the Node engine payload`);
    }
    for (const args of [
      ["tx", "inspect", "--cbor-hex", transactionCbor],
      ["tx", "identify", "--tx-file", join(foreignProject, "transaction.cbor")],
      ["tx", "intent", "--tx-file", join(foreignProject, "transaction.json")],
      ["tx", "witness", "plan", "--tx-file", join(foreignProject, "transaction.cbor")],
      ["tx", "validate", "--tx-file", join(foreignProject, "transaction.cbor")],
      ["tx", "evaluate-scripts", "--tx-file", join(foreignProject, "transaction.cbor")],
    ]) {
      const enriched = await run(process.execPath, ["--import", providerGuardUrl, cli, ...args, "--provider", "koios", "--network", "mainnet", "--output", "json"], { cwd: foreignProject, env: { ...process.env, CSK_PROVIDER_CAPTURE: providerCapture } });
      assert.equal(enriched.code, 0, enriched.stderr);
      const context = JSON.parse(enriched.stdout).value.context;
      assert.equal(context.resolution.provider, "koios");
      assert.ok(context.resolution.error_codes.some(({ code }) => code === "PROVIDER_AUTHENTICATION"));
    }
    const providerRecorded = JSON.parse(await readFile(providerCapture, "utf8"));
    assert.ok(providerRecorded.calls.length > 0, "installed CLI must resolve local provider context from a foreign CWD");
    const cliAttachment = await run(process.execPath, ["--import", networkGuardUrl, cli, "tx", "witness", "attach", "--tx-file", join(foreignProject, "witness-transaction.cbor"), "--witness-file", join(foreignProject, "detached.json"), "--output", "json"], { cwd: foreignProject });
    assert.equal(cliAttachment.code, 0, cliAttachment.stderr);
    assert.deepEqual(JSON.parse(cliAttachment.stdout).value, result.attachment.value, "installed CLI attachment must preserve the Node engine payload");

    const engine = join(packageRoot, "node", "dist", "wasm-tx-inspector.wasm");
    const hidden = `${engine}.hidden`;
    await rename(engine, hidden);
    try {
      for (const args of [["tx", "witness", "plan", "--cbor-hex", transactionCbor], ["tx", "validate", "--cbor-hex", transactionCbor], ["tx", "evaluate-scripts", "--cbor-hex", transactionCbor], ["tx", "witness", "attach", "--tx-file", join(foreignProject, "witness-transaction.cbor"), "--witness-file", join(foreignProject, "detached.json")]]) {
        const failure = await run(process.execPath, ["--import", networkGuardUrl, cli, ...args, "--output", "json"], { cwd: foreignProject });
        assert.equal(failure.code, 5, failure.stderr);
        assert.match(JSON.parse(failure.stdout).error.code, /^ENGINE_/);
      }
    } finally {
      await rename(hidden, engine);
    }
    for (const path of await filesBelow(foreignProject)) {
      const contents = await readFile(path).catch(() => Buffer.alloc(0));
      for (const secret of [witnessFixture.signingKey, witnessFixture.secretSentinel]) assert.equal(contents.includes(secret), false, `secret leaked into foreign-CWD artifact: ${path}`);
    }
  } finally {
    await rm(foreignProject, { recursive: true, force: true });
  }
});

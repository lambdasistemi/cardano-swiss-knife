import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { encryptVault } from "../../lib/src/Cardano/Vault.js";

const cli = new URL("../dist/csk.mjs", import.meta.url);
const vectors = JSON.parse(await readFile(new URL("../../test-vectors/vectors.json", import.meta.url), "utf8"));
const mnemonic = vectors.derivationVectors[0].mnemonic.join(" ");
const derivation = vectors.derivationVectors[0];
const bootstrap = vectors.bootstrapVectors[0];
const byron = vectors.bootstrapVectors.find((vector) => vector.style === "Byron" && vector.rootXPubBech32 && vector.derivationPath);
const signing = vectors.signingVectors[0];
const runRaw = (args, input = "", inheritedFd) => new Promise((resolve) => {
  const child = spawn(process.execPath, [cli.pathname, ...args], { stdio: inheritedFd === undefined ? ["pipe", "pipe", "pipe"] : ["pipe", "pipe", "pipe", "pipe"] });
  let stdout = ""; let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.on("close", (code) => resolve({ code, stdout, stderr }));
  child.stdin.end(input);
  if (inheritedFd !== undefined) {
    child.stdio[3].on("error", () => {});
    child.stdio[3].end(inheritedFd);
  }
});
let commandQueue = Promise.resolve();
const exclusive = (operation) => {
  const queued = commandQueue.then(operation);
  commandQueue = queued.catch(() => {});
  return queued;
};
const run = (args, input = "", inheritedFd) => exclusive(() => runRaw(args, input, inheritedFd));
const json = (args, input) => run([...args, "--output", "json"], input);

test("routes all fourteen offline inventory mappings and renders stable human and JSON results", async () => {
  const commands = [
    [["address", "inspect", "--address", vectors.inspectionVectors[0].address]],
    [["mnemonic", "generate", "--word-count", "12"]],
    [["mnemonic", "validate", "--secret-stdin"], `${mnemonic}\n`],
    [["key", "derive", "--secret-stdin", "--account-index", String(derivation.accountIndex), "--role", derivation.role, "--address-index", String(derivation.addressIndex)], `${mnemonic}\n`],
    [["key", "address", "shelley", "--network", "mainnet", "--payment-xpub", derivation.expected.addressPublicKeyBech32, "--stake-xpub", derivation.expected.stakePublicKeyBech32]],
    [["key", "address", "icarus", "--network", bootstrap.network, "--address-xpub", bootstrap.addressXPubBech32]],
    [["key", "address", "byron", "--network", byron.network, "--address-xpub", byron.addressXPubBech32, "--root-xpub", byron.rootXPubBech32, "--derivation-path", JSON.stringify(byron.derivationPath)]],
    [["key", "restore", "icarus", "--secret-stdin", "--network", "mainnet", "--account-index", "0", "--role", "external", "--address-index", "0"], `${mnemonic}\n`],
    [["key", "restore", "byron", "--secret-stdin", "--network", "mainnet", "--account-index", "0", "--address-index", "0"], `${mnemonic}\n`],
    [["script", "inspect", "--cbor-hex", vectors.scriptHashVectors[0].scriptCborHex]],
    [["script", "author", "--json", vectors.scriptHashVectors[0].scriptJson]],
    [["script", "template", "--json", vectors.scriptTemplateVectors[0].expected.canonicalTemplateJson]],
    [["payload", "sign", "--secret-stdin", "--payload-mode", signing.payloadMode, "--payload-input", signing.payloadInput], `${signing.signingKeyBech32}\n`],
    [["payload", "verify", "--payload-mode", signing.payloadMode, "--payload-input", signing.payloadInput, "--verification-key", signing.verificationKeyBech32, "--signature", signing.signatureHex]],
  ];
  for (const [args, input = ""] of commands) {
    const human = await run(args, input);
    assert.equal(human.code, 0, `${args.join(" ")}: ${human.stderr}`);
    assert.match(human.stdout, /\S/);
    const machine = await json(args, input);
    assert.equal(machine.code, 0, `${args.join(" ")} --json: ${machine.stderr}`);
    assert.deepEqual(Object.keys(JSON.parse(machine.stdout)).sort(), ["ok", "value", "version"]);
  }
});

test("rejects argv secrets, maps usage/domain/secret/engine failures, and redacts the rejected mnemonic", async () => {
  const argvSecret = await run(["mnemonic", "validate", "--mnemonic", mnemonic]);
  assert.equal(argvSecret.code, 2);
  assert.doesNotMatch(`${argvSecret.stdout}${argvSecret.stderr}`, new RegExp(mnemonic));
  const domain = await json(["address", "inspect", "--address", "not-an-address"]);
  assert.equal(domain.code, 3); assert.equal(JSON.parse(domain.stdout).error.code, "DOMAIN_ERROR");
  const secret = await json(["key", "derive", "--secret-fd", "99", "--account-index", "0", "--role", "external", "--address-index", "0"]);
  assert.equal(secret.code, 4); assert.equal(JSON.parse(secret.stdout).error.code, "SECRET_SOURCE");
  for (const result of [argvSecret, domain, secret]) assert.doesNotMatch(`${result.stdout}${result.stderr}`, new RegExp(signing.signingKeyBech32));
});

test("maps a missing package-relative engine to the typed engine exit", { concurrency: false }, async () => {
  await exclusive(async () => {
    const engine = new URL("../dist/cardano-addresses.wasm", import.meta.url);
    const hidden = new URL("../dist/cardano-addresses.wasm.hidden", import.meta.url);
    await rename(engine, hidden);
    try {
      const result = await runRaw(["address", "inspect", "--address", vectors.inspectionVectors[0].address, "--output", "json"]);
      assert.equal(result.code, 5); assert.match(JSON.parse(result.stdout).error.code, /^ENGINE_/);
      const invalid = await runRaw(["address", "inspect", "--address", "not-an-address", "--output", "json"]);
      assert.equal(invalid.code, 5);
      assert.match(JSON.parse(invalid.stdout).error.code, /^ENGINE_/);
    } finally {
      await rename(hidden, engine);
    }

    const emptySecret = await runRaw(["mnemonic", "validate", "--secret-stdin", "--output", "json"]);
    assert.equal(emptySecret.code, 4);
    assert.equal(JSON.parse(emptySecret.stdout).error.code, "SECRET_SOURCE");

    const conversion = await runRaw(["key", "address", "byron", "--network", "mainnet", "--address-xpub", byron.addressXPubBech32, "--root-xpub", byron.rootXPubBech32, "--derivation-path", "not-json", "--output", "json"]);
    assert.equal(conversion.code, 3);
    assert.equal(JSON.parse(conversion.stdout).error.code, "DOMAIN_ERROR");
  });
});

test("reads a mnemonic from a genuinely inherited secret FD", async () => {
  const result = await run(["key", "derive", "--secret-fd", "3", "--account-index", "0", "--role", "external", "--address-index", "0"], "", `${mnemonic}\n`);
  assert.equal(result.code, 0, result.stderr);
  assert.doesNotMatch(`${result.stdout}${result.stderr}`, new RegExp(mnemonic));
});

test("selects a canonical #69 vault entry using an inherited passphrase FD", async () => {
  const dir = await mkdtemp(join(tmpdir(), "csk-cli-vault-source-"));
  const vault = join(dir, "canonical.age");
  const passphrase = "cli test vault passphrase";
  try {
    await writeFile(vault, await encryptVault(passphrase, { cardanoSwissKnifeVault: { version: 1, entries: [{ id: "test-mnemonic", kind: "mnemonic", label: "test", value: mnemonic, createdAt: "2026-07-20T00:00:00.000Z" }] } }));
    const result = await run(["key", "derive", "--vault", vault, "--vault-entry", "test-mnemonic", "--passphrase-fd", "3", "--account-index", "0", "--role", "external", "--address-index", "0"], "", `${passphrase}\n`);
    assert.equal(result.code, 0, result.stderr);
    assert.doesNotMatch(`${result.stdout}${result.stderr}`, new RegExp(`${mnemonic}|${passphrase}`));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("preserves the #69 vault command family", async () => {
  for (const flag of ["--help", "-h"]) {
    const help = await run([flag]);
    assert.equal(help.code, 0); assert.match(help.stdout, /address inspect/); assert.match(help.stdout, /vault create/);
  }
  const result = await run(["vault", "--help"]);
  assert.equal(result.code, 0); assert.match(result.stdout, /vault create/);
});

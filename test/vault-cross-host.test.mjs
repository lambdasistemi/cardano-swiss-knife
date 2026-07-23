import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { decryptVault, encryptVault } from "../lib/src/Cardano/Vault.js";
import { addCredentialFile, atomicWriteVault, createVaultFile, listVaultFile } from "../cli/vault-host.mjs";

const passphrase = "cross-host fixture passphrase";
const payload = { outerExtension: { retained: true }, cardanoSwissKnifeVault: { version: 1, vaultExtension: { retained: true }, entries: [{ id: "browser-entry", kind: "mnemonic", label: "Browser entry", value: "browser-only-secret", createdAt: "2026-07-20T00:00:00.000Z", future: { retained: true } }] } };

test("browser-to-CLI and CLI-to-browser use the same binary age contract without exposing values", async () => {
  const directory = await mkdtemp(join(tmpdir(), "csk-cross-host-"));
  const browserOutput = join(directory, "browser.age");
  await writeFile(browserOutput, await encryptVault(passphrase, payload));
  assert.deepEqual(await listVaultFile(browserOutput, passphrase), [{ id: "browser-entry", kind: "mnemonic", label: "Browser entry", createdAt: "2026-07-20T00:00:00.000Z", future: { retained: true } }]);
  const cliOutput = join(directory, "cli.age");
  await createVaultFile(cliOutput, passphrase, { cardanoSwissKnifeVault: { version: 1, entries: [] } });
  assert.deepEqual(await decryptVault(passphrase, new Uint8Array(await readFile(cliOutput))), { cardanoSwissKnifeVault: { version: 1, entries: [] } });
  assert.ok((await encryptVault(passphrase, payload)) instanceof Uint8Array);
});

test("atomic write cleans its adjacent exclusive temp and preserves the target when the pre-rename seam fails", async () => {
  const directory = await mkdtemp(join(tmpdir(), "csk-atomic-write-"));
  const target = join(directory, "target.age");
  await writeFile(target, "original encrypted target");
  await assert.rejects(() => atomicWriteVault(target, new TextEncoder().encode("replacement"), true, { beforeRename: () => { throw new Error("simulated rename boundary failure"); } }));
  assert.equal(await readFile(target, "utf8"), "original encrypted target");
  const { readdir } = await import("node:fs/promises");
  assert.deepEqual((await readdir(directory)).filter((name) => name.includes(".tmp")), []);
});

test("addCredentialFile appends one canonical provider entry, preserves unrelated entries and extension fields, and writes 0600", async () => {
  const directory = await mkdtemp(join(tmpdir(), "csk-add-credential-"));
  const target = join(directory, "vault.age");
  await writeFile(target, await encryptVault(passphrase, payload));
  await addCredentialFile(target, passphrase, { provider: "blockfrost", id: "blockfrost-entry", label: "Blockfrost mainnet", value: "blockfrost-secret-value" });
  const decrypted = await decryptVault(passphrase, new Uint8Array(await readFile(target)));
  assert.deepEqual(decrypted.outerExtension, payload.outerExtension);
  assert.deepEqual(decrypted.cardanoSwissKnifeVault.vaultExtension, payload.cardanoSwissKnifeVault.vaultExtension);
  assert.deepEqual(decrypted.cardanoSwissKnifeVault.entries[0], payload.cardanoSwissKnifeVault.entries[0]);
  const added = decrypted.cardanoSwissKnifeVault.entries[1];
  assert.equal(added.id, "blockfrost-entry");
  assert.equal(added.kind, "blockfrost-project-id");
  assert.equal(added.label, "Blockfrost mainnet");
  assert.equal(added.value, "blockfrost-secret-value");
  assert.match(added.createdAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/);
  assert.equal((await stat(target)).mode & 0o777, 0o600);
});

test("addCredentialFile maps koios to koios-bearer-token", async () => {
  const directory = await mkdtemp(join(tmpdir(), "csk-add-credential-koios-"));
  const target = join(directory, "vault.age");
  await writeFile(target, await encryptVault(passphrase, payload));
  await addCredentialFile(target, passphrase, { provider: "koios", id: "koios-entry", label: "Koios mainnet", value: "koios-secret-value" });
  const decrypted = await decryptVault(passphrase, new Uint8Array(await readFile(target)));
  assert.equal(decrypted.cardanoSwissKnifeVault.entries[1].kind, "koios-bearer-token");
});

test("addCredentialFile rejects a duplicate id without modifying the vault", async () => {
  const directory = await mkdtemp(join(tmpdir(), "csk-add-credential-dup-"));
  const target = join(directory, "vault.age");
  await writeFile(target, await encryptVault(passphrase, payload));
  const original = await readFile(target);
  await assert.rejects(() => addCredentialFile(target, passphrase, { provider: "blockfrost", id: "browser-entry", label: "Duplicate", value: "value" }), /Vault identity is ambiguous\./);
  assert.deepEqual(await readFile(target), original);
  assert.deepEqual((await readdir(directory)).filter((name) => name.includes(".tmp")), []);
});

test("addCredentialFile preserves the vault on wrong passphrase", async () => {
  const directory = await mkdtemp(join(tmpdir(), "csk-add-credential-wrong-pass-"));
  const target = join(directory, "vault.age");
  await writeFile(target, await encryptVault(passphrase, payload));
  const original = await readFile(target);
  await assert.rejects(() => addCredentialFile(target, "wrong passphrase", { provider: "blockfrost", id: "new", label: "New", value: "value" }), /Vault unlock failed\./);
  assert.deepEqual(await readFile(target), original);
});

test("addCredentialFile rejects whitespace-only or control-character metadata and whitespace-only credential values without modifying the vault", async () => {
  const directory = await mkdtemp(join(tmpdir(), "csk-add-credential-metadata-"));
  const target = join(directory, "vault.age");
  await writeFile(target, await encryptVault(passphrase, payload));
  const original = await readFile(target);
  const cases = [
    [{ provider: "blockfrost", id: "   ", label: "Label", value: "value" }, /Vault credential metadata is invalid\./],
    [{ provider: "blockfrost", id: "id\u0007bad", label: "Label", value: "value" }, /Vault credential metadata is invalid\./],
    [{ provider: "blockfrost", id: "id", label: "  ", value: "value" }, /Vault credential metadata is invalid\./],
    [{ provider: "blockfrost", id: "id", label: "Label", value: "   " }, /Vault credential input is invalid\./],
    [{ provider: "amaru", id: "id", label: "Label", value: "value" }, /Vault provider is unsupported\./],
  ];
  for (const [fields, expected] of cases) {
    await assert.rejects(() => addCredentialFile(target, passphrase, fields), expected);
  }
  assert.deepEqual(await readFile(target), original);
});

test("addCredentialFile cleans its adjacent temp file and preserves the vault when the atomic replacement seam fails", async () => {
  const directory = await mkdtemp(join(tmpdir(), "csk-add-credential-seam-"));
  const target = join(directory, "vault.age");
  await writeFile(target, await encryptVault(passphrase, payload));
  const original = await readFile(target);
  await assert.rejects(() => addCredentialFile(target, passphrase, { provider: "blockfrost", id: "new", label: "New", value: "value" }, { beforeRename: () => { throw new Error("simulated rename boundary failure"); } }));
  assert.deepEqual(await readFile(target), original);
  assert.deepEqual((await readdir(directory)).filter((name) => name.includes(".tmp")), []);
});

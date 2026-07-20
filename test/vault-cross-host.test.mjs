import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { decryptVault, encryptVault } from "../lib/src/Cardano/Vault.js";
import { atomicWriteVault, createVaultFile, listVaultFile } from "../cli/vault-host.mjs";

const passphrase = "cross-host fixture passphrase";
const payload = { cardanoSwissKnifeVault: { version: 1, entries: [{ id: "browser-entry", kind: "mnemonic", label: "Browser entry", value: "browser-only-secret", createdAt: "2026-07-20T00:00:00.000Z", future: { retained: true } }] } };

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

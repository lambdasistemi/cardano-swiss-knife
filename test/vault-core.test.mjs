import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import test from "node:test";
import { Encrypter } from "age-encryption";

import {
  decryptVault,
  encryptVault,
  migrateLegacyVault,
  validateCanonicalVault,
} from "../lib/src/Cardano/Vault.js";

const fixture = async (name) => JSON.parse(await readFile(new URL(`./fixtures/vault/${name}`, import.meta.url), "utf8"));
const passphrase = "test vault passphrase";
const execFileAsync = promisify(execFile);
const kinds = [
  "mnemonic",
  "signing-key",
  "root-private-key",
  "account-private-key",
  "address-private-key",
  "stake-private-key",
  "blockfrost-project-id",
  "koios-bearer-token",
];

const canonical = (entries) => ({ cardanoSwissKnifeVault: { version: 1, entries } });
const entry = (kind, id = kind) => ({
  id,
  kind,
  label: `${kind} label`,
  value: `synthetic-${kind}-secret`,
  createdAt: "2026-07-20T00:00:00.000Z",
});

const encryptAgePayload = async (payload, phrase = passphrase) => {
  const encrypter = new Encrypter();
  encrypter.setPassphrase(phrase);
  return encrypter.encrypt(JSON.stringify(payload));
};

const encryptLegacyCskPayload = async (payload) => {
  const salt = Uint8Array.from({ length: 16 }, (_, index) => index);
  const iv = Uint8Array.from({ length: 12 }, (_, index) => 16 + index);
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: 250000 },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(payload))));
  return {
    version: 1,
    kdf: { name: "PBKDF2", hash: "SHA-256", iterations: 250000, saltBase64: Buffer.from(salt).toString("base64") },
    cipher: { name: "AES-GCM", ivBase64: Buffer.from(iv).toString("base64"), ciphertextBase64: Buffer.from(ciphertext).toString("base64") },
  };
};

const decryptWithOfficialAge = async (ciphertext) => {
  const encoded = Buffer.from(ciphertext).toString("base64");
  const script = [
    "log_user 0",
    `spawn sh -c {printf '%s' ${encoded} | base64 -d | age -d}`,
    'expect "Enter passphrase:"',
    `send -- "${passphrase}\\r"`,
    "expect eof",
    "puts -nonewline $expect_out(buffer)",
  ].join("\n");
  const { stdout } = await execFileAsync("expect", ["-c", script]);
  return JSON.parse(stdout.slice(stdout.indexOf("{")));
};

test("validates canonical v1 entries for every current WebUI kind", () => {
  const payload = canonical(kinds.map((kind) => entry(kind)));
  assert.deepEqual(validateCanonicalVault(payload).entries, payload.cardanoSwissKnifeVault.entries);
});

test("rejects malformed canonical payloads, duplicate IDs, and unsupported versions with secret-free diagnostics", () => {
  const secret = "never-include-this-secret";
  for (const payload of [
    canonical([{ ...entry("mnemonic"), value: secret }, { ...entry("signing-key"), id: "mnemonic", value: secret }]),
    { cardanoSwissKnifeVault: { version: 2, entries: [] } },
    canonical([{ ...entry("mnemonic"), label: "", value: secret }]),
  ]) {
    assert.throws(() => validateCanonicalVault(payload), (error) => {
      assert.match(error.message, /vault (entry|format|version|identity)/i);
      assert.doesNotMatch(error.message, new RegExp(secret));
      return true;
    });
  }
});

test("retains unknown kinds and extension fields exactly across canonical validation and portable round trip", async () => {
  const opaque = {
    ...entry("future-hardware-kind", "opaque"),
    extension: { future: ["round", "trip"] },
    source: "future-host",
  };
  const payload = canonical([opaque]);
  assert.deepEqual(validateCanonicalVault(payload).entries[0], opaque);
  const encrypted = await encryptVault(passphrase, payload);
  assert.ok(encrypted instanceof Uint8Array);
  assert.deepEqual(await decryptVault(passphrase, encrypted), payload);
});

test("uses binary age v1 scrypt passphrase encryption compatible with the official age fixture", async () => {
  const payload = await fixture("canonical-v1.json");
  const encrypted = await encryptVault(passphrase, payload);
  assert.match(new TextDecoder().decode(encrypted.subarray(0, 64)), /^age-encryption\.org\/v1/);
  assert.deepEqual(await decryptVault(passphrase, encrypted), payload);
  const officialAge = new Uint8Array(await readFile(new URL("./fixtures/vault/canonical-v1.age", import.meta.url)));
  assert.deepEqual(await decryptVault(passphrase, officialAge), payload);
  assert.deepEqual(await decryptWithOfficialAge(encrypted), payload);
});

test("migrates the exact legacy CSK AES-GCM envelope", async () => {
  const legacy = await fixture("legacy-csk-v1.json");
  const migrated = await migrateLegacyVault(passphrase, legacy);
  assert.deepEqual(migrated.entries.map(({ id, kind, label }) => ({ id, kind, label })), [
    { id: "legacy-mnemonic", kind: "mnemonic", label: "Legacy seed" },
    { id: "legacy-key", kind: "signing-key", label: "Legacy signing key" },
  ]);
});

test("migrates cardanoTxSignVault v1 with signing source metadata", async () => {
  const migrated = await migrateLegacyVault(passphrase, await encryptAgePayload(await fixture("tx-sign-v1.json")), () => "2026-07-20T00:00:00.000Z");
  assert.deepEqual(migrated.entries, [
    {
      id: "migrated:cardanoTxSignVault:deadbeef",
      kind: "cardano-cli-skey",
      label: "Payment signing key",
      value: JSON.stringify({ type: "PaymentSigningKeyShelley_ed25519", description: "Synthetic payment key", cborHex: "5820deadbeef" }),
      createdAt: "2026-07-20T00:00:00.000Z",
      network: "preprod",
      keyHash: "deadbeef",
      description: "Synthetic payment key",
    },
  ]);
});

test("migrates amaruTreasuryWitnessVault v1 with address xsk source metadata", async () => {
  const migrated = await migrateLegacyVault(passphrase, await encryptAgePayload(await fixture("amaru-v1.json")), () => "2026-07-20T00:00:00.000Z");
  assert.deepEqual(migrated.entries, [
    {
      id: "migrated:amaruTreasuryWitnessVault:c0ffee",
      kind: "cardano-addresses-addr-xsk",
      label: "Treasury root",
      value: "root_xsk1syntheticamarutreasuryroot",
      createdAt: "2026-07-20T00:00:00.000Z",
      network: "mainnet",
      keyHash: "c0ffee",
      description: "Synthetic treasury root",
    },
  ]);
});

test("rejects mismatched map keys, duplicate migrated labels, and duplicate key hashes without leaking secrets", async () => {
  const duplicate = await fixture("tx-sign-v1.json");
  const identity = duplicate.cardanoTxSignVault.identities["Payment signing key"];
  for (const invalid of [
    { ...duplicate, cardanoTxSignVault: { ...duplicate.cardanoTxSignVault, identities: { "Wrong map key": identity } } },
    { ...duplicate, cardanoTxSignVault: { ...duplicate.cardanoTxSignVault, identities: { "Payment signing key": identity, "Other key": { ...identity, label: "Payment signing key", keyHash: "cafebabe" } } } },
    { ...duplicate, cardanoTxSignVault: { ...duplicate.cardanoTxSignVault, identities: { "Payment signing key": identity, "Other key": { ...identity, label: "Other key", keyHash: "deadbeef", source: { ...identity.source, keyEnvelope: { ...identity.source.keyEnvelope, cborHex: "must-not-leak" } } } } } },
  ]) {
    await assert.rejects(() => migrateLegacyVault(passphrase, invalid), (error) => {
      assert.match(error.message, /vault (identity|format) is (ambiguous|invalid)/i);
      assert.doesNotMatch(error.message, /must-not-leak|test vault passphrase/);
      return true;
    });
  }
});

test("rejects wrong passphrases for encrypted legacy wrappers without exposing secrets", async () => {
  const encrypted = await encryptAgePayload(await fixture("tx-sign-v1.json"));
  await assert.rejects(() => migrateLegacyVault("wrong passphrase", encrypted), (error) => {
    assert.match(error.message, /vault unlock failed/i);
    assert.doesNotMatch(error.message, /synthetic-tx-signing-key|wrong passphrase/);
    return true;
  });
});

test("rejects duplicate IDs and invalid required projections after legacy CSK decryption", async () => {
  const duplicate = await encryptLegacyCskPayload({ version: 1, entries: [entry("mnemonic", "duplicate"), { ...entry("signing-key", "duplicate"), value: "another-secret" }] });
  const malformed = await encryptLegacyCskPayload({ version: 1, entries: [{ ...entry("mnemonic"), label: "" }] });
  await assert.rejects(() => migrateLegacyVault(passphrase, duplicate), /vault identity is ambiguous/i);
  await assert.rejects(() => migrateLegacyVault(passphrase, malformed), /vault entry is invalid/i);
});

test("rejects date-only timestamps even though Date.parse accepts them", () => {
  assert.ok(!Number.isNaN(Date.parse("2026-07-20")));
  assert.throws(() => validateCanonicalVault(canonical([{ ...entry("mnemonic"), createdAt: "2026-07-20" }])), /vault entry is invalid/i);
});

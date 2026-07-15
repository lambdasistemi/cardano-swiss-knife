import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");
const baseTxCbor = (
  await readFile(
    path.join(
      repoRoot,
      "specs/001-ledger-functional-layer/fixtures/conway-mainnet-tx.hex",
    ),
    "utf8",
  )
).trim();

const passphrase = "correct horse battery staple";
const mnemonic =
  "message mask aunt wheel ten maze between tomato slow analyst ladder such report capital produce";
const addressSigningKey =
  "addr_xsk1wzrez8tt80xnnll3q0p70edlhnu04nu8xhrdtnpucd3z5g7ghfgp7tlqlu73esn25ck83z2maj0zv0ktwfas3un27jm02dggqeg3hlf64eevsq9704sluy8qha0gnjkj2y75aes93u7gd9ew87vjpefjfsfhd84l";
const addressVerificationKey =
  "addr_xvk1gs3fqwhyayz2drdx857yw7jyvnjqsje2sc7qlx4ryp8z4cpvh4hn4tnjeqqtultplcgwp067389dy5fafmnqtreus6tju0ueyrjnynq0l3lh3";
const addressSignerHash =
  "3207c32d806ec2cabc78ff7ed869bd3098b7db93c43cc8aa93ab59eb";
const stakeSigningKey =
  "stake_xsk1fzzzcr77sw274y4xs8c3ltwaap8k6qd49rrt8rqdhu7vufwghfggsh7d94t055xycxhm4x68wwprsqj8gdggtymf9xlh38z8qxu8f4gmexswjjcthk4dj0ks50ll25he5k67smgc8trzlerg7wg49fq6nucydyhw";
const txCbor = addRequiredSigner(baseTxCbor, addressSignerHash);

const BREAK = Symbol("break");

function hexToBytes(hex) {
  const normalized = hex.trim();
  if (!/^[0-9a-f]+$/i.test(normalized) || normalized.length % 2 !== 0) {
    throw new Error(`Invalid hex input: ${hex}`);
  }
  return Uint8Array.from(
    normalized.match(/../g).map((chunk) => Number.parseInt(chunk, 16)),
  );
}

function readCborLength(bytes, start, additional) {
  let offset = start;
  if (additional < 24) return { length: additional, offset };
  if (additional === 24) return { length: bytes[offset], offset: offset + 1 };
  if (additional === 25) {
    return {
      length: (bytes[offset] << 8) | bytes[offset + 1],
      offset: offset + 2,
    };
  }
  if (additional === 26) {
    return {
      length:
        bytes[offset] * 0x1000000 +
        (bytes[offset + 1] << 16) +
        (bytes[offset + 2] << 8) +
        bytes[offset + 3],
      offset: offset + 4,
    };
  }
  if (additional === 27) {
    let length = 0n;
    for (let index = 0; index < 8; index += 1) {
      length = (length << 8n) | BigInt(bytes[offset + index]);
    }
    return { length: Number(length), offset: offset + 8 };
  }
  if (additional === 31) return { length: null, offset };
  throw new Error(`Unsupported CBOR additional info: ${additional}`);
}

function skipCborItem(bytes, start) {
  const initial = bytes[start];
  const major = initial >> 5;
  const additional = initial & 0x1f;
  const decoded = readCborLength(bytes, start + 1, additional);
  let offset = decoded.offset;

  if (major === 0 || major === 1 || major === 7) return offset;
  if (major === 2 || major === 3) {
    if (decoded.length !== null) return offset + decoded.length;
    while (bytes[offset] !== 0xff) offset = skipCborItem(bytes, offset);
    return offset + 1;
  }
  if (major === 4) {
    if (decoded.length === null) {
      while (bytes[offset] !== 0xff) offset = skipCborItem(bytes, offset);
      return offset + 1;
    }
    for (let index = 0; index < decoded.length; index += 1) {
      offset = skipCborItem(bytes, offset);
    }
    return offset;
  }
  if (major === 5) {
    if (decoded.length === null) {
      while (bytes[offset] !== 0xff) {
        offset = skipCborItem(bytes, offset);
        offset = skipCborItem(bytes, offset);
      }
      return offset + 1;
    }
    for (let index = 0; index < decoded.length; index += 1) {
      offset = skipCborItem(bytes, offset);
      offset = skipCborItem(bytes, offset);
    }
    return offset;
  }
  if (major === 6) return skipCborItem(bytes, offset);
  throw new Error(`Unsupported CBOR major type: ${major}`);
}

function addRequiredSigner(txHex, signerHashHex) {
  const bytes = hexToBytes(txHex);
  if (bytes[0] !== 0x84) {
    throw new Error("Expected the signing fixture to be a four-item transaction array.");
  }
  const bodyStart = 1;
  const bodyHeader = bytes[bodyStart];
  const bodyMajor = bodyHeader >> 5;
  const bodyCount = bodyHeader & 0x1f;
  if (bodyMajor !== 5 || bodyCount >= 23) {
    throw new Error("Expected the signing fixture body to use a short definite map.");
  }

  let offset = bodyStart + 1;
  let insertionOffset = null;
  for (let index = 0; index < bodyCount; index += 1) {
    const keyOffset = offset;
    const keyByte = bytes[keyOffset];
    if (keyByte > 0x17) {
      throw new Error("Expected the signing fixture body to use small integer keys.");
    }
    if (keyByte === 14) {
      throw new Error("Signing fixture already declares the derived signer.");
    }
    if (insertionOffset === null && keyByte > 14) insertionOffset = keyOffset;
    offset = skipCborItem(bytes, keyOffset);
    offset = skipCborItem(bytes, offset);
  }
  if (insertionOffset === null) insertionOffset = offset;

  const requiredSigner = Uint8Array.from([
    0x0e,
    0x81,
    0x58,
    0x1c,
    ...hexToBytes(signerHashHex),
  ]);
  const patched = new Uint8Array(bytes.length + requiredSigner.length);
  patched.set(bytes.slice(0, insertionOffset), 0);
  patched[bodyStart] = bodyHeader + 1;
  patched.set(requiredSigner, insertionOffset);
  patched.set(bytes.slice(insertionOffset), insertionOffset + requiredSigner.length);
  return Array.from(patched, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function readCbor(bytes) {
  let offset = 0;

  function readLength(additional) {
    if (additional < 24) return additional;
    if (additional === 24) return bytes[offset++];
    if (additional === 25) return (bytes[offset++] << 8) | bytes[offset++];
    if (additional === 26) {
      return (
        bytes[offset++] * 0x1000000 +
        (bytes[offset++] << 16) +
        (bytes[offset++] << 8) +
        bytes[offset++]
      );
    }
    if (additional === 27) {
      let value = 0n;
      for (let index = 0; index < 8; index += 1) {
        value = (value << 8n) | BigInt(bytes[offset++]);
      }
      return Number(value);
    }
    if (additional === 31) return null;
    throw new Error(`Unsupported CBOR additional info: ${additional}`);
  }

  function readItem() {
    const initial = bytes[offset++];
    const major = initial >> 5;
    const additional = initial & 0x1f;
    if (major === 7 && additional === 31) return BREAK;

    switch (major) {
      case 0:
        return readLength(additional);
      case 1: {
        const value = readLength(additional);
        return value === null ? null : -1 - value;
      }
      case 2: {
        const length = readLength(additional);
        if (length === null) {
          const chunks = [];
          for (;;) {
            const chunk = readItem();
            if (chunk === BREAK) break;
            if (!(chunk instanceof Uint8Array)) {
              throw new Error("Invalid indefinite byte-string chunk.");
            }
            chunks.push(chunk);
          }
          const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
          const merged = new Uint8Array(total);
          let chunkOffset = 0;
          for (const chunk of chunks) {
            merged.set(chunk, chunkOffset);
            chunkOffset += chunk.length;
          }
          return merged;
        }
        const start = offset;
        offset += length;
        return bytes.slice(start, offset);
      }
      case 3: {
        const length = readLength(additional);
        if (length === null) {
          let text = "";
          for (;;) {
            const chunk = readItem();
            if (chunk === BREAK) break;
            if (typeof chunk !== "string") {
              throw new Error("Invalid indefinite text-string chunk.");
            }
            text += chunk;
          }
          return text;
        }
        const start = offset;
        offset += length;
        return new TextDecoder().decode(bytes.slice(start, offset));
      }
      case 4: {
        const length = readLength(additional);
        const items = [];
        if (length === null) {
          for (;;) {
            const item = readItem();
            if (item === BREAK) break;
            items.push(item);
          }
          return items;
        }
        for (let index = 0; index < length; index += 1) items.push(readItem());
        return items;
      }
      case 5: {
        const length = readLength(additional);
        const entries = [];
        if (length === null) {
          for (;;) {
            const key = readItem();
            if (key === BREAK) break;
            entries.push([key, readItem()]);
          }
          return { map: entries };
        }
        for (let index = 0; index < length; index += 1) {
          entries.push([readItem(), readItem()]);
        }
        return { map: entries };
      }
      case 6:
        return { tag: readLength(additional), value: readItem() };
      case 7:
        if (additional === 20) return false;
        if (additional === 21) return true;
        if (additional === 22) return null;
        if (additional === 23) return undefined;
        throw new Error(`Unsupported CBOR simple value: ${additional}`);
      default:
        throw new Error(`Unsupported CBOR major type: ${major}`);
    }
  }

  return readItem();
}

function countVkeyWitnesses(txHex) {
  const decoded = readCbor(hexToBytes(txHex));
  if (!Array.isArray(decoded) || decoded.length < 2) {
    throw new Error("Expected a top-level transaction array.");
  }
  const witnessSet = decoded[1];
  if (
    !witnessSet ||
    typeof witnessSet !== "object" ||
    !("map" in witnessSet) ||
    !Array.isArray(witnessSet.map)
  ) {
    throw new Error("Expected a CBOR witness-set map.");
  }
  const vkeyEntry = witnessSet.map.find(([key]) => key === 0);
  if (!vkeyEntry) return 0;
  const value = vkeyEntry[1];
  const witnesses = Array.isArray(value)
    ? value
    : value && typeof value === "object" && Array.isArray(value.value)
      ? value.value
      : null;
  if (!Array.isArray(witnesses)) {
    throw new Error("Expected vkey witnesses to decode as an array.");
  }
  return witnesses.length;
}

function signingPanel(page) {
  return page.getByRole("region", { name: "Sign transaction body" });
}

function signingOutput(panel, label) {
  return panel.locator(".signing-output-card").filter({
    has: panel.page().getByRole("heading", { name: label, exact: true }),
  });
}

async function installLedgerOperationRecorder(page) {
  await page.evaluate(() => {
    const original = globalThis.runInspector;
    globalThis.__signingLedgerOperations = [];
    globalThis.runInspector = async (input) => {
      try {
        const request = JSON.parse(input);
        if (request && typeof request.op === "string") {
          globalThis.__signingLedgerOperations.push(request.op);
        }
      } catch (_error) {
        // Raw inspection requests do not use the operation envelope.
      }
      return original(input);
    };
  });
}

async function decodeTransaction(page, cbor = txCbor) {
  await page.getByRole("tab", { name: "Paste CBOR" }).click();
  await page.getByPlaceholder("Paste Conway transaction CBOR hex").fill(cbor);
  await page.getByRole("button", { name: "Decode", exact: true }).click();
  await expect(page.getByRole("button", { name: "Change input" })).toBeVisible({
    timeout: 30_000,
  });
}

async function createVaultAndSaveDerivedAddressKey(page) {
  await page.goto("/vault");
  await page.getByLabel("Vault passphrase").fill(passphrase);
  const createDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Create vault" }).click();
  await createDownload;
  await expect(page.locator(".vault-summary")).toContainText("Unlocked");

  await page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("link", { name: "Keys", exact: true })
    .click();
  await page.getByRole("tab", { name: "Restore", exact: true }).click();
  await page.getByLabel("Recovery phrase").fill(mnemonic);
  await expect(page.getByText(addressVerificationKey, { exact: true })).toBeVisible();

  const addressKeyCard = page.locator(".key-output-card").filter({
    has: page.getByRole("heading", { name: "Address private key", exact: true }),
  });
  const saveDownload = page.waitForEvent("download");
  await addressKeyCard.getByRole("button", { name: "Save to vault" }).click();
  await saveDownload;
  await expect(page.getByText("Saved Address private key into the vault.")).toBeVisible();
}

async function openWorkbench(page) {
  await page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("link", { name: "Inspect", exact: true })
    .click();
  await expect(page).toHaveURL(/\/inspect\/?$/);
}

test("workbench derives and vaults the missing signer before attaching exactly one vkey witness", async ({
  page,
}) => {
  await createVaultAndSaveDerivedAddressKey(page);
  await openWorkbench(page);
  await installLedgerOperationRecorder(page);
  await decodeTransaction(page);

  await page.getByRole("tab", { name: "Witness", exact: true }).click();
  const missingSection = page.locator(".witness-section").filter({
    has: page.getByText("Missing declared signers", { exact: true }),
  });
  const missingSignerHash = (
    await missingSection.locator(".witness-row code").first().textContent()
  )?.trim();
  expect(missingSignerHash).toMatch(/^[0-9a-f]{56}$/);

  const panel = signingPanel(page);
  await expect(panel).toBeVisible();
  await expect(panel.getByText("Body hash", { exact: true })).toBeVisible();
  await expect(panel.locator(".vault-shelf--tx-signing")).toContainText(
    "Address private key",
  );
  await expect(panel.locator(".vault-shelf--tx-signing")).not.toContainText(
    "Mnemonic",
  );
  await panel
    .locator(".vault-shelf--tx-signing")
    .getByRole("button", { name: "Peek" })
    .click();
  await expect(panel.getByLabel("Transaction signing key")).toHaveValue(
    addressSigningKey,
  );

  await panel.getByRole("button", { name: "Create signed transaction" }).click();
  await expect(panel.getByText("Matches a missing required signer", { exact: true })).toBeVisible({
    timeout: 30_000,
  });

  const bodyHash = await signingOutput(panel, "Body hash")
    .locator(".signing-output-value")
    .textContent();
  const verificationKey = await signingOutput(panel, "Verification key")
    .locator(".signing-output-value")
    .textContent();
  const signerHash = await signingOutput(panel, "Signer hash")
    .locator(".signing-output-value")
    .textContent();
  const signature = await signingOutput(panel, "Signature")
    .locator(".signing-output-value")
    .textContent();
  const detachedWitness = await signingOutput(panel, "Detached vkey witness CBOR")
    .locator(".signing-output-value")
    .textContent();
  const patchAction = await signingOutput(panel, "Attachment action")
    .locator(".signing-output-value")
    .textContent();
  const patchedTx = await signingOutput(panel, "Patched signed transaction CBOR")
    .locator(".signing-output-value")
    .textContent();

  expect(bodyHash?.trim()).toMatch(/^[0-9a-f]{64}$/);
  expect(verificationKey?.trim()).toBe(addressVerificationKey);
  expect(signerHash?.trim()).toBe(missingSignerHash);
  expect(signature?.trim()).toMatch(/^[0-9a-f]{128}$/);
  expect(detachedWitness?.trim()).toMatch(/^825820[0-9a-f]{64}5840[0-9a-f]{128}$/);
  expect(patchAction?.trim()).not.toBe("");
  expect(patchedTx?.trim()).not.toBe(txCbor);
  expect(countVkeyWitnesses(patchedTx.trim())).toBe(
    countVkeyWitnesses(txCbor) + 1,
  );
  await expect(signingOutput(panel, "Detached vkey witness CBOR")).toBeVisible();

  expect(
    await page.evaluate(() =>
      globalThis.__signingLedgerOperations.filter(
        (operation) => operation === "tx.witness.attach",
      ),
    ),
  ).toHaveLength(1);

  await page.getByRole("button", { name: "Change input" }).click();
  await decodeTransaction(page, patchedTx.trim());
  await panel.getByRole("button", { name: "Create signed transaction" }).click();
  await expect(panel.getByRole("alert")).toContainText(
    "Signer already present in the witness set.",
  );
  expect(
    await page.evaluate(() =>
      globalThis.__signingLedgerOperations.filter(
        (operation) => operation === "tx.witness.attach",
      ),
    ),
  ).toHaveLength(1);
});

test("workbench validates inspection, body hash, key, signer plan, and local signing boundaries", async ({
  page,
}) => {
  await page.goto("/inspect");
  const panel = signingPanel(page);
  const signButton = panel.getByRole("button", { name: "Create signed transaction" });
  await expect(signButton).toBeDisabled();
  await expect(panel).toContainText(
    "Inspect a transaction first to load its CBOR and body hash.",
  );

  await installLedgerOperationRecorder(page);
  await decodeTransaction(page);
  await expect(signButton).toBeEnabled();

  await signButton.click();
  await expect(panel.getByRole("alert")).toContainText(
    "Enter an extended signing key before signing.",
  );

  await panel.getByRole("button", { name: "Show signing key" }).click();
  await panel.getByLabel("Transaction signing key").fill("not-a-bech32-key");
  await signButton.click();
  await expect(panel.getByRole("alert")).toContainText(/bech32|invalid/i);

  await panel.getByLabel("Transaction signing key").fill(mnemonic);
  await signButton.click();
  await expect(panel.getByRole("alert")).toContainText(/unsupported signing key|bech32/i);

  await panel.getByLabel("Transaction signing key").fill(stakeSigningKey);
  await signButton.click();
  await expect(panel.getByRole("alert")).toContainText(
    "Signer is not required by the current witness plan.",
  );
  expect(
    await page.evaluate(() =>
      globalThis.__signingLedgerOperations.filter(
        (operation) => operation === "tx.witness.attach",
      ),
    ),
  ).toHaveLength(0);

  await page.getByRole("button", { name: "Change input" }).click();
  await page.evaluate(() => {
    const original = globalThis.runInspector;
    globalThis.runInspector = async (input) => {
      const request = JSON.parse(input);
      if (request?.op === "tx.inspect") {
        await new Promise((resolve) => setTimeout(resolve, 350));
      }
      return original(input);
    };
  });
  await page.getByRole("tab", { name: "Paste CBOR" }).click();
  await page.getByPlaceholder("Paste Conway transaction CBOR hex").fill(txCbor);
  await page.getByRole("button", { name: "Decode", exact: true }).click();
  await expect(signButton).toBeDisabled();
  await expect(page.getByRole("button", { name: "Change input" })).toBeVisible({
    timeout: 30_000,
  });

  await page.getByRole("button", { name: "Change input" }).click();
  await page.evaluate(() => {
    const original = globalThis.runInspector;
    globalThis.runInspector = async (input) => {
      const result = await original(input);
      const request = JSON.parse(input);
      if (request?.op !== "tx.identify" || !result.exitOk) return result;
      const parsed = JSON.parse(result.stdout);
      if (parsed?.result?.identification) {
        parsed.result.identification.body_hash = "zz";
      }
      return { ...result, stdout: JSON.stringify(parsed) };
    };
  });
  await decodeTransaction(page);
  await panel.getByLabel("Transaction signing key").fill(addressSigningKey);
  await signButton.click();
  await expect(panel.getByRole("alert")).toContainText(/sign|hex|payload/i);
  await expect(signingOutput(panel, "Patched signed transaction CBOR")).toHaveCount(0);
});

test("workbench never claims patched CBOR when authoritative attachment fails or is invalid", async ({
  page,
}) => {
  await page.goto("/inspect");
  await decodeTransaction(page);
  const panel = signingPanel(page);
  await panel.getByRole("button", { name: "Show signing key" }).click();
  await panel.getByLabel("Transaction signing key").fill(addressSigningKey);

  await page.evaluate(() => {
    const original = globalThis.runInspector;
    globalThis.__attachmentFailureMode = "exit";
    globalThis.runInspector = async (input) => {
      const request = JSON.parse(input);
      if (request?.op === "tx.witness.attach") {
        if (globalThis.__attachmentFailureMode === "exit") {
          return {
            stdout: "",
            stderr: "forced authoritative attachment failure",
            exitOk: false,
          };
        }
        if (globalThis.__attachmentFailureMode === "invalid") {
          return { stdout: "not-json", stderr: "", exitOk: true };
        }
      }
      return original(input);
    };
  });

  await panel.getByRole("button", { name: "Create signed transaction" }).click();
  await expect(panel.getByRole("alert")).toContainText(
    "forced authoritative attachment failure",
  );
  await expect(signingOutput(panel, "Patched signed transaction CBOR")).toHaveCount(0);

  await page.evaluate(() => {
    globalThis.__attachmentFailureMode = "invalid";
  });
  await panel.getByRole("button", { name: "Create signed transaction" }).click();
  await expect(panel.getByRole("alert")).toContainText(
    "Ledger witness attachment response was not JSON.",
  );
  await expect(signingOutput(panel, "Patched signed transaction CBOR")).toHaveCount(0);
});

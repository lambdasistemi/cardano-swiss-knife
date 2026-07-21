import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const vectors = JSON.parse(
  fs.readFileSync(
    path.join(process.cwd(), "test-vectors", "vectors.json"),
    "utf8",
  ),
);

const signingVector = vectors.signingVectors.find(
  (candidate: { label: string }) =>
    candidate.label === "message-sign-address-hex",
);

if (!signingVector) {
  throw new Error("Missing signing fixture: message-sign-address-hex");
}

const unrelatedWitnessVector = vectors.signingVectors.find(
  (candidate: { label: string }) => candidate.label === "message-sign-root-text",
);

if (!unrelatedWitnessVector) {
  throw new Error("Missing unrelated witness fixture: message-sign-root-text");
}

// Predecoded once from unrelatedWitnessVector's extended verification key.
const unrelatedWitnessPublicKeyHex =
  "52c906b92c8f5713a52251ce20853bea07b6155b76bc6c755f8090574d4c9345";

const baseTxCbor = fs
  .readFileSync(
    path.join(
      process.cwd(),
      "tests",
      "fixtures",
      "tx-validate-complete.tx-cbor.txt",
    ),
    "utf8",
  )
  .trim();

const addressSignerHash =
  "3207c32d806ec2cabc78ff7ed869bd3098b7db93c43cc8aa93ab59eb";

const witnessFixture = JSON.parse(
  fs.readFileSync(
    path.join(
      process.cwd(),
      "node",
      "test",
      "fixtures",
      "transaction-witnesses.json",
    ),
    "utf8",
  ),
);

const BREAK = Symbol("break");

const hexToBytes = (hex: string) => {
  const normalized = hex.trim();
  if (!/^[0-9a-f]+$/i.test(normalized) || normalized.length % 2 !== 0) {
    throw new Error(`Invalid hex input: ${hex}`);
  }

  return Uint8Array.from(
    normalized.match(/../g)!.map((chunk) => Number.parseInt(chunk, 16)),
  );
};

const detachedWitnessFromVector = (publicKeyHex: string, signatureHex: string) => {
  const publicKey = hexToBytes(publicKeyHex);
  const signature = hexToBytes(signatureHex);
  if (publicKey.length !== 32 || signature.length !== 64) {
    throw new Error("Expected a public verification key and Ed25519 signature test vector.");
  }
  return Array.from(
    Uint8Array.from([0x82, 0x58, 0x20, ...publicKey, 0x58, 0x40, ...signature]),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
};

const readCborLength = (
  bytes: Uint8Array,
  start: number,
  additional: number,
) => {
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
};

const skipCborItem = (bytes: Uint8Array, start: number): number => {
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
};

const addRequiredSigner = (txHex: string, signerHashHex: string) => {
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
  let insertionOffset: number | null = null;
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
};

const addAdditionalRequiredSigner = (txHex: string, signerHashHex: string) => {
  const bytes = hexToBytes(txHex);
  const bodyStart = 1;
  const bodyHeader = bytes[bodyStart];
  const bodyCount = bodyHeader & 0x1f;
  let offset = bodyStart + 1;

  for (let index = 0; index < bodyCount; index += 1) {
    const keyOffset = offset;
    const keyByte = bytes[keyOffset];
    offset = skipCborItem(bytes, keyOffset);
    const valueEnd = skipCborItem(bytes, offset);
    if (keyByte === 14) {
      if (bytes[offset] !== 0x81) {
        throw new Error("Expected the fixture required-signer roster to have one signer.");
      }
      const additionalSigner = Uint8Array.from([
        0x58,
        0x1c,
        ...hexToBytes(signerHashHex),
      ]);
      const patched = new Uint8Array(bytes.length + additionalSigner.length);
      patched.set(bytes.slice(0, valueEnd), 0);
      patched[offset] = 0x82;
      patched.set(additionalSigner, valueEnd);
      patched.set(bytes.slice(valueEnd), valueEnd + additionalSigner.length);
      return Array.from(patched, (byte) => byte.toString(16).padStart(2, "0")).join("");
    }
    offset = valueEnd;
  }

  throw new Error("Expected the fixture transaction to declare required signers.");
};

const withInvalidHereafter = (txHex: string, slot: number) => {
  if (!Number.isInteger(slot) || slot < 0 || slot > 0xffffffff) {
    throw new Error(`Expected an unsigned 32-bit slot: ${slot}`);
  }

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

  const ttl = Uint8Array.from([
    0x1a,
    (slot >>> 24) & 0xff,
    (slot >>> 16) & 0xff,
    (slot >>> 8) & 0xff,
    slot & 0xff,
  ]);
  let offset = bodyStart + 1;
  let insertionOffset: number | null = null;
  for (let index = 0; index < bodyCount; index += 1) {
    const keyOffset = offset;
    const keyByte = bytes[keyOffset];
    if (keyByte > 0x17) {
      throw new Error("Expected the signing fixture body to use small integer keys.");
    }
    offset = skipCborItem(bytes, keyOffset);
    const valueEnd = skipCborItem(bytes, offset);
    if (keyByte === 3) {
      const patched = new Uint8Array(bytes.length - (valueEnd - offset) + ttl.length);
      patched.set(bytes.slice(0, offset), 0);
      patched.set(ttl, offset);
      patched.set(bytes.slice(valueEnd), offset + ttl.length);
      return Array.from(patched, (byte) => byte.toString(16).padStart(2, "0")).join("");
    }
    if (insertionOffset === null && keyByte > 3) insertionOffset = keyOffset;
    offset = valueEnd;
  }

  if (insertionOffset === null) insertionOffset = offset;
  const patched = new Uint8Array(bytes.length + 1 + ttl.length);
  patched.set(bytes.slice(0, insertionOffset), 0);
  patched[bodyStart] = bodyHeader + 1;
  patched[insertionOffset] = 3;
  patched.set(ttl, insertionOffset + 1);
  patched.set(bytes.slice(insertionOffset), insertionOffset + 1 + ttl.length);
  return Array.from(patched, (byte) => byte.toString(16).padStart(2, "0")).join("");
};

const withoutInvalidHereafter = (txHex: string) => {
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
  for (let index = 0; index < bodyCount; index += 1) {
    const keyOffset = offset;
    const keyByte = bytes[keyOffset];
    if (keyByte > 0x17) {
      throw new Error("Expected the signing fixture body to use small integer keys.");
    }
    offset = skipCborItem(bytes, keyOffset);
    const valueEnd = skipCborItem(bytes, offset);
    if (keyByte === 3) {
      const patched = new Uint8Array(bytes.length - (valueEnd - keyOffset));
      patched.set(bytes.slice(0, keyOffset), 0);
      patched[bodyStart] = bodyHeader - 1;
      patched.set(bytes.slice(valueEnd), keyOffset);
      return Array.from(patched, (byte) => byte.toString(16).padStart(2, "0")).join("");
    }
    offset = valueEnd;
  }

  return txHex;
};

const txCborWithoutExpiry = withoutInvalidHereafter(
  addRequiredSigner(baseTxCbor, addressSignerHash),
);
const txCbor = withInvalidHereafter(txCborWithoutExpiry, 2_100_000_001);
const secondTxCbor = withInvalidHereafter(txCborWithoutExpiry, 2_100_000_002);
const twoSignerTxCbor = addAdditionalRequiredSigner(
  txCbor,
  witnessFixture.nonTargetSignerHash,
);

const readCbor = (bytes: Uint8Array) => {
  let offset = 0;

  const readLength = (additional: number): number | null => {
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
  };

  const readItem = (): unknown => {
    const initial = bytes[offset++];
    const major = initial >> 5;
    const additional = initial & 0x1f;

    if (major === 7 && additional === 31) {
      return BREAK;
    }

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
          const chunks: Uint8Array[] = [];
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
        const end = start + length;
        offset = end;
        return bytes.slice(start, end);
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
        const end = start + length;
        offset = end;
        return new TextDecoder().decode(bytes.slice(start, end));
      }
      case 4: {
        const length = readLength(additional);
        const items: unknown[] = [];
        if (length === null) {
          for (;;) {
            const item = readItem();
            if (item === BREAK) break;
            items.push(item);
          }
          return items;
        }
        for (let index = 0; index < length; index += 1) {
          items.push(readItem());
        }
        return items;
      }
      case 5: {
        const length = readLength(additional);
        const entries: Array<[unknown, unknown]> = [];
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
  };

  return readItem();
};

const countVkeyWitnesses = (txHex: string) => {
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

  const witnessValue = vkeyEntry[1];
  const witnesses = Array.isArray(witnessValue)
    ? witnessValue
    : witnessValue &&
        typeof witnessValue === "object" &&
        "tag" in witnessValue &&
        Array.isArray(witnessValue.value)
      ? witnessValue.value
      : null;
  if (!Array.isArray(witnesses)) {
    throw new Error("Expected vkey witnesses to decode as an array.");
  }

  return witnesses.length;
};

test("workbench stores the Blockfrost project ID in the encrypted vault and hides it for CBOR input", async ({
  page,
}) => {
  await page.goto("/vault");

  await page.getByLabel("Vault passphrase").fill("correct horse battery staple");
  await page.getByRole("button", { name: "Create vault" }).click();
  await expect(page.locator(".vault-summary")).toContainText("Unlocked");

  await page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("link", { name: "Settings" })
    .click();

  const credentialInput = page.getByLabel("Blockfrost project ID");
  await credentialInput.fill("mainnet_vault_project_id");
  await page.getByLabel("Vault item name").fill("Ops Blockfrost");
  await page.getByRole("button", { name: "Save secret to vault" }).click();
  await expect(page.getByText("Saved Ops Blockfrost into the vault.")).toBeVisible();

  await credentialInput.fill("");
  const firstVaultEntry = page.locator(".vault-shelf--provider .vault-entry").first();
  await expect(firstVaultEntry.getByText("Ops Blockfrost", { exact: true })).toBeVisible();
  await firstVaultEntry.getByRole("button", { name: "Pop" }).click();
  await expect(credentialInput).toHaveValue("mainnet_vault_project_id");
  await expect(
    page.locator(".vault-shelf--provider .vault-entry").getByText("Ops Blockfrost", { exact: true }),
  ).toHaveCount(0);

  await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Workbench" }).click();
  await page.getByRole("tab", { name: "Paste CBOR" }).click();
  await expect(page.getByLabel("Blockfrost project ID")).toHaveCount(0);
});

test("transaction signing can load a private key from the vault", async ({
  page,
}) => {
  await page.goto("/vault");

  await page.getByLabel("Vault passphrase").fill("correct horse battery staple");
  await page.getByRole("button", { name: "Create vault" }).click();

  await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Keys" }).click();
  await page.getByRole("tab", { name: "Sign & verify", exact: true }).click();
  const signingCard = page.getByRole("region", { name: "Sign payload" });

  await signingCard.getByRole("button", { name: "Show signing key" }).click();
  await signingCard.getByLabel("Signing key").fill(signingVector.signingKeyBech32);
  await signingCard.getByLabel("Vault item name").fill("Ops tx signer");
  await signingCard.getByRole("button", { name: "Save signing key to vault" }).click();
  await expect(page.getByText("Saved Ops tx signer into the vault.")).toBeVisible();

  await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Workbench" }).click();
  await page.getByRole("tab", { name: "Paste CBOR" }).click();
  await page.getByPlaceholder("Paste Conway transaction CBOR hex").fill(txCbor);
  await page.getByRole("button", { name: "Decode", exact: true }).click();

  const signCard = page.getByRole("region", { name: "Sign transaction body" });
  await expect(signCard).not.toContainText("Inspect a transaction first", {
    timeout: 20000,
  });

  const txSigningInput = signCard.getByLabel("Transaction signing key");
  await signCard.getByRole("button", { name: "Show signing key" }).click();
  await txSigningInput.fill("");

  const firstVaultEntry = signCard.locator(".vault-entry").first();
  await expect(firstVaultEntry.getByText("Ops tx signer", { exact: true })).toBeVisible();
  await firstVaultEntry.getByRole("button", { name: "Pop" }).click();

  await expect(txSigningInput).toHaveValue(signingVector.signingKeyBech32);
  await expect(
    signCard.locator(".vault-entry").getByText("Ops tx signer", { exact: true }),
  ).toHaveCount(0);
});

test("transactions page signs into transaction CBOR and keeps detached witness details visible", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "__lastCopiedText", {
      configurable: true,
      writable: true,
      value: null,
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          (
            window as typeof window & {
              __lastCopiedText: string | null;
            }
          ).__lastCopiedText = text;
        },
        readText: async () =>
          (
            window as typeof window & {
              __lastCopiedText: string | null;
            }
          ).__lastCopiedText ?? "",
      },
    });
  });
  await page.goto("/inspect");
  await page.getByRole("tab", { name: "Paste CBOR" }).click();
  await page.getByPlaceholder("Paste Conway transaction CBOR hex").fill(txCbor);
  await page.getByRole("button", { name: "Decode", exact: true }).click();

  const signCard = page.getByRole("region", { name: "Sign transaction body" });
  await expect(signCard).not.toContainText("Inspect a transaction first", {
    timeout: 20000,
  });
  await expect(
    page.getByText("Transaction ID", { exact: true }),
  ).toBeVisible();

  await signCard.getByRole("button", { name: "Show signing key" }).click();
  await signCard.getByLabel("Transaction signing key").fill(signingVector.signingKeyBech32);
  await signCard
    .getByRole("button", { name: "Create signed transaction" })
    .click();

  await expect(
    signCard.getByText(signingVector.verificationKeyBech32),
  ).toBeVisible();
  await expect(signCard.getByText("Detached vkey witness CBOR")).toBeVisible();

  const signedTxCard = signCard
    .locator(".signing-output-card")
    .filter({ has: page.getByText("Patched signed transaction CBOR") });
  await expect(signedTxCard).toBeVisible();

  const signedTxHex = (await signedTxCard.locator(".signing-output-value").textContent())?.trim();
  if (!signedTxHex) {
    throw new Error("Signed transaction CBOR result is missing.");
  }

  const witnessCard = signCard
    .locator(".signing-output-card")
    .filter({ has: page.getByText("Detached vkey witness CBOR") });
  const witnessHex = (await witnessCard.locator(".signing-output-value").textContent())?.trim();
  if (!witnessHex) {
    throw new Error("Detached witness CBOR result is missing.");
  }

  expect(signedTxHex).not.toBe(txCbor);
  expect(signedTxHex).toContain(witnessHex);
  expect(countVkeyWitnesses(signedTxHex)).toBe(2);

  await signedTxCard.getByRole("button", { name: "Copy" }).click();
  const clipboardText = await page.evaluate(
    () =>
      (
        window as typeof window & {
          __lastCopiedText: string | null;
        }
      ).__lastCopiedText,
  );
  expect(clipboardText).toBe(signedTxHex);
  expect(clipboardText).not.toBe(txCbor);
});

test("transaction signing stays disabled until inspection finishes", async ({
  page,
}) => {
  await page.goto("/inspect");
  await page.getByRole("tab", { name: "Paste CBOR" }).click();
  await page.getByPlaceholder("Paste Conway transaction CBOR hex").fill(txCbor);

  const signCard = page.getByRole("region", { name: "Sign transaction body" });
  await signCard.getByRole("button", { name: "Show signing key" }).click();
  await signCard.getByLabel("Transaction signing key").fill(signingVector.signingKeyBech32);

  const signButton = signCard.getByRole("button", {
    name: "Create signed transaction",
  });

  await page.getByRole("button", { name: "Decode", exact: true }).click();
  await expect(signButton).toBeDisabled();

  await expect(signCard).not.toContainText("Inspect a transaction first", {
    timeout: 20000,
  });
  await expect(signButton).toBeEnabled();
});

test("workbench persists finite-TTL transactions and selection drives the inspector", async ({
  page,
}) => {
  const decode = async (cbor: string) => {
    await page.getByRole("tab", { name: "Paste CBOR" }).click();
    await page.getByPlaceholder("Paste Conway transaction CBOR hex").fill(cbor);
    await page.getByRole("button", { name: "Decode", exact: true }).click();
    await expect(page.getByText("Transaction ID", { exact: true })).toBeVisible({
      timeout: 20000,
    });
  };

  await page.goto("/inspect");
  await decode(txCbor);
  const firstId = (await page.locator(".loaded-context-hash code").textContent())?.trim();
  if (!firstId) throw new Error("First decoded transaction did not render an id.");

  const workbench = page.getByRole("region", { name: "Transaction workbench" });
  await workbench.getByRole("button", { name: "Add current transaction" }).click();
  await expect(workbench).toContainText("Incomplete");
  await expect(workbench.getByText("Required signers", { exact: true })).toBeVisible();
  await expect(workbench.getByText("Satisfied signers", { exact: true })).toBeVisible();
  await expect(workbench.getByText("Missing signers", { exact: true })).toBeVisible();
  await expect(workbench).toContainText("None satisfied.");
  await expect(workbench).toContainText(addressSignerHash);

  await page.getByRole("button", { name: "Change input" }).click();
  await decode(secondTxCbor);
  const secondId = (await page.locator(".loaded-context-hash code").textContent())?.trim();
  if (!secondId) throw new Error("Second decoded transaction did not render an id.");
  expect(secondId).not.toBe(firstId);
  await workbench.getByRole("button", { name: "Add current transaction" }).click();

  const entries = workbench.getByRole("list", { name: "Saved transactions" });
  await expect(entries.getByRole("button", { name: `Select ${firstId}` })).toBeVisible();
  await expect(entries.getByRole("button", { name: `Select ${secondId}` })).toBeVisible();
  const savedRows = entries.getByRole("listitem");
  await expect(savedRows).toHaveCount(2);
  await expect(savedRows.nth(0)).toContainText("Open");
  await expect(savedRows.nth(1)).toContainText("Open");
  await entries.getByRole("button", { name: `Select ${firstId}` }).click();
  await expect(page.locator(".loaded-context-hash code")).toHaveText(firstId);
  await entries.getByRole("button", { name: `Select ${secondId}` }).click();
  await expect(page.locator(".loaded-context-hash code")).toHaveText(secondId);

  await page.reload();
  await expect(workbench.getByRole("list", { name: "Saved transactions" }).getByRole("button")).toHaveCount(2);

  await page.getByRole("button", { name: "Change input" }).click();
  await decode(txCborWithoutExpiry);
  await expect(workbench.getByRole("button", { name: "Add current transaction" })).toBeDisabled();
  await expect(workbench).toContainText(
    "A finite invalid_hereafter from the engine is required before saving.",
  );
});

test("workbench persistently collects vault and pasted transaction witnesses", async ({ page }) => {
  let tipRequests = 0;
  let protocolParameterRequests = 0;
  let successfulContextRequests = 0;
  let providerContextAvailable = false;
  await page.addInitScript(() => window.localStorage.setItem("provider", "Koios"));
  await page.route("**/tip", async (route) => {
    tipRequests += 1;
    if (!providerContextAvailable) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "planned validation-context failure" }),
      });
      return;
    }
    successfulContextRequests += 1;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify([{ abs_slot: "42", epoch_no: "1" }]),
    });
  });
  await page.route("**/cli_protocol_params", async (route) => {
    protocolParameterRequests += 1;
    if (!providerContextAvailable) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "planned protocol-parameter failure" }),
      });
      return;
    }
    await route.fulfill({ contentType: "application/json", body: JSON.stringify([{}]) });
  });

  const decode = async (cbor: string) => {
    await page.getByRole("tab", { name: "Paste CBOR" }).click();
    await page.getByPlaceholder("Paste Conway transaction CBOR hex").fill(cbor);
    await page.getByRole("button", { name: "Decode", exact: true }).click();
    await expect(page.getByText("Transaction ID", { exact: true })).toBeVisible({
      timeout: 20_000,
    });
  };

  const detachedWitnessFromStandaloneSigning = async (signingKey: string) => {
    const signing = page.getByRole("region", { name: "Sign transaction body" });
    const showKey = signing.getByRole("button", { name: "Show signing key" });
    if ((await showKey.count()) > 0) await showKey.click();
    await signing.getByLabel("Transaction signing key").fill(signingKey);
    await signing.getByRole("button", { name: "Create signed transaction" }).click();
    const witnessCard = signing
      .locator(".signing-output-card")
      .filter({ has: page.getByText("Detached vkey witness CBOR", { exact: true }) });
    await expect(witnessCard).toBeVisible({ timeout: 20_000 });
    const witness = (await witnessCard.locator(".signing-output-value").textContent())?.trim();
    if (!witness) throw new Error("Standalone signing did not render a detached witness.");
    return witness;
  };

  const collectedWitnessesFor = (entryId: string) =>
    page.evaluate(async (id) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = window.indexedDB.open("cardano-swiss-knife.entry-store", 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });
      try {
        return await new Promise<Array<{ signerId: string; witnessCborHex: string }>>((resolve, reject) => {
          const transaction = database.transaction("entries", "readonly");
          const request = transaction.objectStore("entries").get(id);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(request.result.collectedWitnesses);
        });
      } finally {
        database.close();
      }
    }, entryId);

  const putSiblingFixture = (entryId: string) =>
    page.evaluate(async ({ id, unsignedTxCborHex, signerId }) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = window.indexedDB.open("cardano-swiss-knife.entry-store", 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });
      try {
        await new Promise<void>((resolve, reject) => {
          const transaction = database.transaction("entries", "readwrite");
          transaction.onerror = () => reject(transaction.error);
          transaction.oncomplete = () => resolve();
          transaction.objectStore("entries").put({
            entryId: id,
            unsignedTxCborHex,
            requiredSigners: [signerId],
            collectedWitnesses: [],
            invalidAfterSlot: 2_100_000_002,
            status: "Open",
          });
        });
      } finally {
        database.close();
      }
    }, { id: entryId, unsignedTxCborHex: twoSignerTxCbor, signerId: witnessFixture.requiredSignerHash });

  await page.goto("/vault");
  await page.getByLabel("Vault passphrase").fill("correct horse battery staple");
  await page.getByRole("button", { name: "Create vault" }).click();
  await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Keys" }).click();
  await page.getByRole("tab", { name: "Sign & verify", exact: true }).click();
  const keySigning = page.getByRole("region", { name: "Sign payload" });
  await keySigning.getByRole("button", { name: "Show signing key" }).click();
  await keySigning.getByLabel("Signing key").fill(witnessFixture.signingKey);
  await keySigning.getByLabel("Vault item name").fill("Workbench signer");
  await keySigning.getByRole("button", { name: "Save signing key to vault" }).click();

  await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Workbench" }).click();
  await decode(twoSignerTxCbor);
  const secondWitness = await detachedWitnessFromStandaloneSigning(witnessFixture.nonTargetSigningKey);
  const unrelatedWitness = detachedWitnessFromVector(
    unrelatedWitnessPublicKeyHex,
    unrelatedWitnessVector.signatureHex,
  );
  const firstEntryId = (await page.locator(".loaded-context-hash code").textContent())?.trim();
  if (!firstEntryId) throw new Error("First workbench transaction did not render an id.");

  const workbench = page.getByRole("region", { name: "Transaction workbench" });
  await workbench.getByRole("button", { name: "Add current transaction" }).click();
  const entries = workbench.getByRole("list", { name: "Saved transactions" });
  const firstEntry = entries.getByRole("listitem").filter({ hasText: firstEntryId });
  await expect(firstEntry).toContainText("0/2");
  await expect(firstEntry).toContainText("Incomplete");
  const emptyWitnessSnapshot = await collectedWitnessesFor(firstEntryId);
  expect(emptyWitnessSnapshot).toEqual([]);
  const siblingEntryId = "fixture-sibling-entry";
  await putSiblingFixture(siblingEntryId);
  const siblingWitnessSnapshot = await collectedWitnessesFor(siblingEntryId);
  expect(siblingWitnessSnapshot).toEqual([]);

  await workbench.getByRole("button", { name: "Use vault key Workbench signer" }).click();
  await workbench.getByRole("button", { name: "Produce witness" }).click();
  await expect(workbench.getByRole("alert")).toContainText(
    "Could not fetch the current provider slot.",
  );
  await expect.poll(() => collectedWitnessesFor(firstEntryId)).toEqual(emptyWitnessSnapshot);

  providerContextAvailable = true;
  await workbench.getByRole("button", { name: "Produce witness" }).click();
  await expect(firstEntry).toContainText("1/2");
  await expect(workbench.getByText("Normalized witness CBOR", { exact: true })).toBeVisible();
  await expect(workbench.getByText("TxWitness ConwayEra", { exact: false })).toBeVisible();
  const producedWitness = await workbench.getByLabel("Normalized witness CBOR").inputValue();
  expect(producedWitness).not.toBe("");

  await workbench.getByLabel("Pasted detached witness").fill(secondWitness);
  await workbench.getByRole("button", { name: "Attach pasted witness" }).click();
  await expect(firstEntry).toContainText("2/2");
  await expect(firstEntry).toContainText("Complete");
  const rawWitnessSnapshot = await collectedWitnessesFor(firstEntryId);
  expect(rawWitnessSnapshot).toEqual([
    { signerId: witnessFixture.requiredSignerHash, witnessCborHex: producedWitness },
    { signerId: witnessFixture.nonTargetSignerHash, witnessCborHex: secondWitness },
  ]);

  const secondWitnessEnvelope = JSON.stringify({
    type: "TxWitness ConwayEra",
    description: "Ledger Cddl Format",
    cborHex: secondWitness,
  });
  await workbench.getByLabel("Pasted detached witness").fill(secondWitnessEnvelope);
  await workbench.getByRole("button", { name: "Attach pasted witness" }).click();
  await expect(workbench.getByRole("alert")).toContainText(
    "Signer already has a collected witness.",
  );
  await expect(firstEntry).toContainText("2/2");
  await expect.poll(() => collectedWitnessesFor(firstEntryId)).toEqual(rawWitnessSnapshot);

  await workbench.getByLabel("Replace collected witness").check();
  await workbench.getByRole("button", { name: "Attach pasted witness" }).click();
  await expect(firstEntry).toContainText("2/2");
  await expect.poll(() => collectedWitnessesFor(firstEntryId)).toEqual(rawWitnessSnapshot);

  await workbench.getByLabel("Pasted detached witness").fill("0");
  await workbench.getByRole("button", { name: "Attach pasted witness" }).click();
  await expect(workbench.getByRole("alert")).toContainText(
    "CBOR hexadecimal input must have an even number of characters.",
  );
  await expect(firstEntry).toContainText("2/2");
  await expect.poll(() => collectedWitnessesFor(firstEntryId)).toEqual(rawWitnessSnapshot);

  await workbench.getByLabel("Pasted detached witness").fill(
    JSON.stringify({
      type: "Tx ConwayEra",
      description: "Ledger Cddl Format",
      cborHex: twoSignerTxCbor,
    }),
  );
  await workbench.getByRole("button", { name: "Attach pasted witness" }).click();
  await expect(workbench.getByRole("alert")).toContainText(
    "Witness input must not use a Tx ConwayEra TextEnvelope.",
  );
  await expect(firstEntry).toContainText("2/2");
  await expect.poll(() => collectedWitnessesFor(firstEntryId)).toEqual(rawWitnessSnapshot);

  await workbench.getByLabel("Pasted detached witness").fill(unrelatedWitness);
  await workbench.getByRole("button", { name: "Attach pasted witness" }).click();
  await expect(workbench.getByRole("alert")).toContainText(
    "Pasted witness does not satisfy exactly one required signer for this entry.",
  );
  await expect(firstEntry).toContainText("2/2");
  await expect.poll(() => collectedWitnessesFor(firstEntryId)).toEqual(rawWitnessSnapshot);

  await expect.poll(() => collectedWitnessesFor(siblingEntryId)).toEqual(siblingWitnessSnapshot);
  await expect.poll(() => tipRequests).toBeGreaterThan(0);
  await expect.poll(() => protocolParameterRequests).toBeGreaterThan(0);
  await expect.poll(() => successfulContextRequests).toBeGreaterThan(0);

  await page.reload();
  await expect(entries.getByRole("button", { name: `Select ${firstEntryId}` })).toBeVisible();
  await entries.getByRole("button", { name: `Select ${firstEntryId}` }).click();
  await expect(entries.getByRole("listitem").filter({ hasText: firstEntryId })).toContainText("2/2");
  await expect(entries.getByRole("listitem").filter({ hasText: siblingEntryId })).toContainText("0/1");
  await expect.poll(() => collectedWitnessesFor(firstEntryId)).toEqual(rawWitnessSnapshot);
  await expect.poll(() => collectedWitnessesFor(siblingEntryId)).toEqual(siblingWitnessSnapshot);
});

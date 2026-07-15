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

const txCbor = addRequiredSigner(baseTxCbor, addressSignerHash);

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

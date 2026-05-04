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

const txCbor = fs
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

test("transactions page stores the Blockfrost project ID in the encrypted vault and hides it for CBOR input", async ({
  page,
}) => {
  await page.goto("/");

  await page.getByRole("button", { name: /Vault Encrypted file storage/ }).click();
  await page
    .getByPlaceholder("Strong passphrase for the vault file")
    .fill("correct horse battery staple");
  await page.getByRole("button", { name: "Create vault" }).click();
  await expect(
    page.locator(".kv-row").filter({ has: page.getByText("State") }).getByText("Unlocked"),
  ).toBeVisible();

  await page
    .getByRole("button", { name: /Transactions Inspect and sign/ })
    .click();

  const inspectCard = page
    .locator("section.card")
    .filter({ has: page.getByText("Inspect transaction") });

  const credentialInput = inspectCard.getByPlaceholder("mainnet...");
  await inspectCard.getByRole("button", { name: "Show credential" }).click();
  await credentialInput.fill("mainnet_vault_project_id");
  await inspectCard.getByPlaceholder("Blockfrost project ID").fill("Ops Blockfrost");
  await inspectCard.getByRole("button", { name: "Save secret to vault" }).click();
  await expect(page.getByText("Saved Ops Blockfrost into the vault.")).toBeVisible();

  await credentialInput.fill("");
  const firstVaultEntry = inspectCard.locator(".vault-entry").first();
  await expect(firstVaultEntry.getByText("Ops Blockfrost", { exact: true })).toBeVisible();
  await firstVaultEntry.getByRole("button", { name: "Pop" }).click();
  await expect(credentialInput).toHaveValue("mainnet_vault_project_id");
  await expect(
    inspectCard.locator(".vault-entry").getByText("Ops Blockfrost", { exact: true }),
  ).toHaveCount(0);

  await inspectCard.getByRole("button", { name: "CBOR hex" }).click();
  await expect(credentialInput).toBeHidden();
});

test("transaction signing can load a private key from the vault", async ({
  page,
}) => {
  await page.goto("/");

  await page.getByRole("button", { name: /Vault Encrypted file storage/ }).click();
  await page
    .getByPlaceholder("Strong passphrase for the vault file")
    .fill("correct horse battery staple");
  await page.getByRole("button", { name: "Create vault" }).click();

  await page.getByRole("button", { name: /Signing Sign and verify/ }).click();
  const signingCard = page
    .locator("section.card")
    .filter({ has: page.getByText("Sign payload") });

  await signingCard.getByRole("button", { name: "Show signing key" }).click();
  await signingCard
    .getByPlaceholder("addr_xsk1... or stake_xsk1...")
    .fill(signingVector.signingKeyBech32);
  await signingCard.getByPlaceholder("Signing key").fill("Ops tx signer");
  await signingCard.getByRole("button", { name: "Save signing key to vault" }).click();
  await expect(page.getByText("Saved Ops tx signer into the vault.")).toBeVisible();

  await page
    .getByRole("button", { name: /Transactions Inspect and sign/ })
    .click();

  const inspectCard = page
    .locator("section.card")
    .filter({ has: page.getByText("Inspect transaction") });
  await inspectCard.getByRole("button", { name: "CBOR hex" }).click();
  await inspectCard.getByPlaceholder("84a40081825820...").fill(txCbor);
  await inspectCard.getByRole("button", { name: "Inspect transaction" }).click();

  const signCard = page
    .locator("section.card")
    .filter({ has: page.getByText("Sign transaction body") });
  await expect(signCard).not.toContainText("Inspect a transaction first", {
    timeout: 20000,
  });

  const txSigningInput = signCard.getByPlaceholder("addr_xsk1... or stake_xsk1...");
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
  await page.goto("/");

  await page
    .getByRole("button", { name: /Transactions Inspect and sign/ })
    .click();
  await expect(page.locator(".page-title")).toHaveText("Transaction Workbench");

  const inspectCard = page
    .locator("section.card")
    .filter({ has: page.getByText("Inspect transaction") });
  await inspectCard.getByRole("button", { name: "CBOR hex" }).click();
  await inspectCard.getByPlaceholder("84a40081825820...").fill(txCbor);
  await inspectCard
    .getByRole("button", { name: "Inspect transaction" })
    .click();

  const signCard = page
    .locator("section.card")
    .filter({ has: page.getByText("Sign transaction body") });
  await expect(signCard).not.toContainText("Inspect a transaction first", {
    timeout: 20000,
  });
  await expect(
    page.locator(".kv-label", { hasText: "Transaction ID" }),
  ).toBeVisible();

  await signCard.getByRole("button", { name: "Show signing key" }).click();
  await signCard
    .getByPlaceholder("addr_xsk1... or stake_xsk1...")
    .fill(signingVector.signingKeyBech32);
  await signCard
    .getByRole("button", { name: /Create detached witness|Create signed transaction/ })
    .click();

  await expect(
    signCard.getByText(signingVector.verificationKeyBech32),
  ).toBeVisible();
  await expect(signCard.getByText("VKey witness CBOR")).toBeVisible();

  const signedTxCard = signCard
    .locator(".output-card")
    .filter({ has: page.getByText("Signed transaction CBOR") });
  await expect(signedTxCard).toBeVisible();

  const signedTxHex = (await signedTxCard.locator(".output-value").textContent())?.trim();
  if (!signedTxHex) {
    throw new Error("Signed transaction CBOR result is missing.");
  }

  const witnessCard = signCard
    .locator(".output-card")
    .filter({ has: page.getByText("VKey witness CBOR") });
  const witnessHex = (await witnessCard.locator(".output-value").textContent())?.trim();
  if (!witnessHex) {
    throw new Error("Detached witness CBOR result is missing.");
  }

  expect(signedTxHex).not.toBe(txCbor);
  expect(signedTxHex).toContain(witnessHex);
  expect(countVkeyWitnesses(signedTxHex)).toBe(2);
});

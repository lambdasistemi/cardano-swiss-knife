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

test("transactions page inspects CBOR and creates detached witness material", async ({
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
    .getByRole("button", { name: "Create detached witness" })
    .click();

  await expect(
    signCard.getByText(signingVector.verificationKeyBech32),
  ).toBeVisible();
  await expect(signCard.getByText("VKey witness CBOR")).toBeVisible();
});

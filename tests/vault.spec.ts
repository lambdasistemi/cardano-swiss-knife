import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const fixture = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "test-vectors", "vectors.json"), "utf8"),
);

const signingVector = fixture.signingVectors.find(
  (candidate: { label: string }) => candidate.label === "message-sign-address-hex",
);
const restoreMnemonic =
  "message mask aunt wheel ten maze between tomato slow analyst ladder such report capital produce";

if (!signingVector) {
  throw new Error("Missing signing fixture: message-sign-address-hex");
}

test("vault stores mnemonic and signing secrets without clipboard roundtrips", async ({
  page,
}) => {
  await page.goto("/");

  await page.getByRole("button", { name: /Vault Encrypted file storage/ }).click();
  await expect(page.locator(".page-title")).toHaveText("Encrypted Vault");
  await page.getByPlaceholder("Strong passphrase for the vault file").fill("correct horse battery staple");
  await page.getByRole("button", { name: "Show passphrase" }).click();
  await page.getByRole("button", { name: "Create vault" }).click();
  await expect(page.locator(".kv-row").filter({ has: page.getByText("State") }).getByText("Unlocked")).toBeVisible();

  await page.getByRole("button", { name: /Mnemonic Generate and hand off/ }).click();
  await page.getByRole("button", { name: "12 words" }).click();
  await page.getByRole("button", { name: "Generate phrase" }).click();
  await page.getByPlaceholder("12-word mnemonic").fill("Paper backup");
  await page.getByRole("button", { name: "Save to vault" }).click();
  await expect(page.getByText("Saved Paper backup into the vault.")).toBeVisible();

  await page.getByRole("button", { name: /Restore Choose family first/ }).click();
  const restoreCard = page.locator("section.card").filter({ has: page.getByText("Restore and build") });
  await expect(restoreCard.locator(".vault-entry").getByText("Paper backup", { exact: true })).toBeVisible();
  await restoreCard
    .locator(".vault-entry")
    .filter({ has: page.getByText("Paper backup", { exact: true }) })
    .getByRole("button", { name: "Peek" })
    .click();
  await expect(
    page.locator('[placeholder="abandon abandon ... or use the generated phrase"]'),
  ).toHaveValue(/.+/);
  await expect(restoreCard.locator(".vault-entry").getByText("Paper backup", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: /Signing Sign and verify/ }).click();
  const signCard = page.locator("section.card").filter({ has: page.getByText("Sign payload") });
  await signCard.getByRole("button", { name: "Show signing key" }).click();
  await signCard.getByPlaceholder("addr_xsk1... or stake_xsk1...").fill(signingVector.signingKeyBech32);
  await signCard.getByPlaceholder("Signing key").fill("Ops signer");
  await signCard.getByRole("button", { name: "Save signing key to vault" }).click();
  await expect(page.getByText("Saved Ops signer into the vault.")).toBeVisible();
  await signCard.getByPlaceholder("addr_xsk1... or stake_xsk1...").fill("");
  const firstSigningEntry = signCard.locator(".vault-entry").first();
  await expect(firstSigningEntry.getByText("Ops signer", { exact: true })).toBeVisible();
  await firstSigningEntry.getByRole("button", { name: "Pop" }).click();
  await expect(signCard.getByPlaceholder("addr_xsk1... or stake_xsk1...")).toHaveValue(
    signingVector.signingKeyBech32,
  );
  await expect(signCard.locator(".vault-entry").getByText("Ops signer", { exact: true })).toHaveCount(0);
});

test("vault exports and reimports encrypted file contents", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: /Vault Encrypted file storage/ }).click();
  await expect(page.locator(".page-title")).toHaveText("Encrypted Vault");
  await page.getByPlaceholder("Strong passphrase for the vault file").fill("correct horse battery staple");
  await page.getByRole("button", { name: "Create vault" }).click();

  await page.getByRole("button", { name: /Mnemonic Generate and hand off/ }).click();
  await page.getByRole("button", { name: "12 words" }).click();
  await page.getByRole("button", { name: "Generate phrase" }).click();
  await page.getByPlaceholder("12-word mnemonic").fill("Importable phrase");
  const saveDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save to vault" }).click();
  const download = await saveDownloadPromise;
  const downloadedPath = await download.path();
  if (!downloadedPath) {
    throw new Error("Expected saved vault file to exist on disk.");
  }

  await page.getByRole("button", { name: /Vault Encrypted file storage/ }).click();
  await page.getByRole("button", { name: "Lock vault" }).click();
  await expect(page.locator(".kv-row").filter({ has: page.getByText("State") }).getByText("Locked")).toBeVisible();

  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Open vault" }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(downloadedPath);

  await expect(page.locator(".kv-row").filter({ has: page.getByText("State") }).getByText("Unlocked")).toBeVisible();
  const entriesCard = page.locator("section.card").filter({ has: page.getByText("Clipboard stack") });
  await expect(entriesCard.getByText("Importable phrase", { exact: true })).toBeVisible();
});

test("vault can capture restore-derived signing keys and reuse them in signing", async ({
  page,
}) => {
  await page.goto("/");

  await page.getByRole("button", { name: /Vault Encrypted file storage/ }).click();
  await page.getByPlaceholder("Strong passphrase for the vault file").fill("correct horse battery staple");
  await page.getByRole("button", { name: "Create vault" }).click();

  await page.getByRole("button", { name: /Restore Choose family first/ }).click();
  const restoreInput = page.locator(
    'input[type="password"][placeholder="abandon abandon ... or use the generated phrase"]',
  );
  await restoreInput.fill(restoreMnemonic);

  const addressKeyCard = page
    .locator(".output-card")
    .filter({ has: page.getByText("Address private key", { exact: true }) });
  await addressKeyCard.getByRole("button", { name: "Push to stack" }).click();
  await expect(page.getByText("Saved Shelley external address 0 private key into the vault.")).toBeVisible();

  await page.getByRole("button", { name: /Signing Sign and verify/ }).click();
  const signCard = page.locator("section.card").filter({ has: page.getByText("Sign payload") });
  const firstSigningEntry = signCard.locator(".vault-entry").first();
  await expect(firstSigningEntry.getByText("Shelley external address 0 private key", { exact: true })).toBeVisible();
  await firstSigningEntry.getByRole("button", { name: "Pop" }).click();
  await expect(signCard.getByPlaceholder("addr_xsk1... or stake_xsk1...")).toHaveValue(/^addr_xsk1/);
  await expect(
    signCard.locator(".vault-entry").getByText("Shelley external address 0 private key", { exact: true }),
  ).toHaveCount(0);
});

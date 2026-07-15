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
  await page.goto("/vault");

  await expect(page.getByRole("heading", { name: "Vault", exact: true })).toBeVisible();
  await page.getByLabel("Vault passphrase").fill("correct horse battery staple");
  await page.getByRole("button", { name: "Show passphrase" }).click();
  await page.getByRole("button", { name: "Create vault" }).click();
  await expect(page.locator(".vault-summary")).toContainText("Unlocked");

  await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Keys" }).click();
  await page.getByRole("button", { name: "12 words" }).click();
  await page.getByRole("button", { name: "Generate phrase" }).click();
  await page.getByLabel("Vault item name").fill("Paper backup");
  await page.getByRole("button", { name: "Save to vault" }).click();
  await expect(page.getByText("Saved Paper backup into the vault.")).toBeVisible();

  await page.getByRole("tab", { name: "Restore", exact: true }).click();
  const restoreShelf = page.locator(".vault-shelf--restore");
  await expect(restoreShelf.locator(".vault-entry").getByText("Paper backup", { exact: true })).toBeVisible();
  await restoreShelf
    .locator(".vault-entry")
    .filter({ has: page.getByText("Paper backup", { exact: true }) })
    .getByRole("button", { name: "Peek" })
    .click();
  await expect(
    page.getByLabel("Recovery phrase"),
  ).toHaveValue(/.+/);
  await expect(restoreShelf.locator(".vault-entry").getByText("Paper backup", { exact: true })).toBeVisible();

  await page.getByRole("tab", { name: "Sign & verify", exact: true }).click();
  const signCard = page.getByRole("region", { name: "Sign payload" });
  await signCard.getByRole("button", { name: "Show signing key" }).click();
  await signCard.getByLabel("Signing key").fill(signingVector.signingKeyBech32);
  await signCard.getByLabel("Vault item name").fill("Ops signer");
  await signCard.getByRole("button", { name: "Save signing key to vault" }).click();
  await expect(page.getByText("Saved Ops signer into the vault.")).toBeVisible();
  await signCard.getByLabel("Signing key").fill("");
  const firstSigningEntry = signCard.locator(".vault-entry").first();
  await expect(firstSigningEntry.getByText("Ops signer", { exact: true })).toBeVisible();
  await firstSigningEntry.getByRole("button", { name: "Pop" }).click();
  await expect(signCard.getByLabel("Signing key")).toHaveValue(
    signingVector.signingKeyBech32,
  );
  await expect(signCard.locator(".vault-entry").getByText("Ops signer", { exact: true })).toHaveCount(0);
});

test("vault exports and reimports encrypted file contents", async ({ page }) => {
  await page.goto("/vault");

  await expect(page.getByRole("heading", { name: "Vault", exact: true })).toBeVisible();
  await page.getByLabel("Vault passphrase").fill("correct horse battery staple");
  await page.getByRole("button", { name: "Create vault" }).click();

  await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Keys" }).click();
  await page.getByRole("button", { name: "12 words" }).click();
  await page.getByRole("button", { name: "Generate phrase" }).click();
  await page.getByLabel("Vault item name").fill("Importable phrase");
  const saveDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save to vault" }).click();
  const download = await saveDownloadPromise;
  const downloadedPath = await download.path();
  if (!downloadedPath) {
    throw new Error("Expected saved vault file to exist on disk.");
  }

  await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Vault" }).click();
  await page.getByRole("button", { name: "Lock vault" }).click();
  await expect(page.locator(".vault-summary")).toContainText("Locked");

  await page.getByLabel("Vault passphrase").fill("correct horse battery staple");
  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Open vault" }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(downloadedPath);

  await expect(page.locator(".vault-summary")).toContainText("Unlocked");
  await expect(page.locator(".vault-entry-list").getByText("Importable phrase", { exact: true })).toBeVisible();
});

test("vault can capture restore-derived signing keys and reuse them in signing", async ({
  page,
}) => {
  await page.goto("/vault");

  await page.getByLabel("Vault passphrase").fill("correct horse battery staple");
  await page.getByRole("button", { name: "Create vault" }).click();

  await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Keys" }).click();
  await page.getByRole("tab", { name: "Restore", exact: true }).click();
  const restoreInput = page.getByLabel("Recovery phrase");
  await restoreInput.fill(restoreMnemonic);

  const addressKeyCard = page
    .locator(".key-output-card")
    .filter({ has: page.getByText("Address private key", { exact: true }) });
  await addressKeyCard.getByRole("button", { name: "Save to vault" }).click();
  await expect(page.getByText("Saved Address private key into the vault.")).toBeVisible();

  await page.getByRole("tab", { name: "Sign & verify", exact: true }).click();
  const signCard = page.getByRole("region", { name: "Sign payload" });
  const firstSigningEntry = signCard.locator(".vault-entry").first();
  await expect(
    firstSigningEntry.locator("strong", { hasText: "Address private key" }),
  ).toBeVisible();
  await firstSigningEntry.getByRole("button", { name: "Pop" }).click();
  await expect(signCard.getByLabel("Signing key")).toHaveValue(/^addr_xsk1/);
  await expect(
    signCard.locator(".vault-entry").getByText("Address private key", { exact: true }),
  ).toHaveCount(0);
});

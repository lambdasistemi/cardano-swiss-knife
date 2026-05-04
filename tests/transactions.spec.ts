import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const vectors = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "test-vectors", "vectors.json"), "utf8"),
);

const signingVector = vectors.signingVectors.find(
  (candidate: { label: string }) => candidate.label === "message-sign-address-hex",
);

if (!signingVector) {
  throw new Error("Missing signing fixture: message-sign-address-hex");
}

const txCbor = fs
  .readFileSync(path.join(process.cwd(), "tests", "fixtures", "tx-validate-complete.tx-cbor.txt"), "utf8")
  .trim();

test("transactions page inspects CBOR and creates detached witness material", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: /Transactions Inspect and sign/ }).click();
  await expect(page.locator(".page-title")).toHaveText("Transaction Workbench");

  const inspectCard = page.locator("section.card").filter({ has: page.getByText("Inspect transaction") });
  await inspectCard.getByRole("button", { name: "CBOR hex" }).click();
  await inspectCard.getByPlaceholder("84a40081825820...").fill(txCbor);
  await inspectCard.getByRole("button", { name: "Inspect transaction" }).click();

  const signCard = page.locator("section.card").filter({ has: page.getByText("Sign transaction body") });
  await expect(signCard).not.toContainText("Inspect a transaction first", { timeout: 20000 });
  await expect(page.locator(".kv-label", { hasText: "Transaction ID" })).toBeVisible();

  await signCard.getByRole("button", { name: "Show signing key" }).click();
  await signCard.getByPlaceholder("addr_xsk1... or stake_xsk1...").fill(signingVector.signingKeyBech32);
  await signCard.getByRole("button", { name: "Create detached witness" }).click();

  await expect(signCard.getByText(signingVector.verificationKeyBech32)).toBeVisible();
  await expect(signCard.getByText("VKey witness CBOR")).toBeVisible();
});

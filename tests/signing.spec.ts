import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const fixture = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "test-vectors", "vectors.json"), "utf8"),
);

const vector = fixture.signingVectors.find(
  (candidate: { label: string }) => candidate.label === "message-sign-address-hex",
);

if (!vector) {
  throw new Error("Missing signing fixture: message-sign-address-hex");
}

test("signing page signs and verifies payloads", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: /Signing Sign and verify/ }).click();
  await expect(page.locator(".page-title")).toHaveText("Signing Tools");

  const signCard = page.locator("section.card").filter({ has: page.getByText("Sign payload") });
  await signCard.getByRole("button", { name: "Hex" }).click();
  await signCard.getByPlaceholder("deadbeef00ff11").fill(vector.payloadInput);
  await signCard.getByRole("button", { name: "Show signing key" }).click();
  await signCard.getByPlaceholder("addr_xsk1... or stake_xsk1...").fill(vector.signingKeyBech32);

  const signatureCard = page.locator("section.card").filter({ has: page.getByText("Signature") });
  await expect(signatureCard.getByText(vector.verificationKeyBech32)).toBeVisible();
  await expect(signatureCard.getByText(vector.signatureHex)).toBeVisible();

  const verifyCard = page.locator("section.card").filter({ has: page.getByText("Verify signature") });
  await verifyCard.getByRole("button", { name: "Use signed payload" }).click();
  await expect(verifyCard.getByText("Valid signature")).toBeVisible();

  await verifyCard.getByPlaceholder("deadbeef00ff11").fill("deadbeef00ff12");
  await expect(verifyCard.getByText("Invalid signature")).toBeVisible();
});

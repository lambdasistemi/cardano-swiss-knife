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

test("keys sign and verify tab signs and verifies payloads", async ({ page }) => {
  await page.goto("/keys");

  await page.getByRole("tab", { name: "Sign & verify", exact: true }).click();

  const signCard = page.getByRole("region", { name: "Sign payload" });
  await signCard.getByRole("button", { name: "Hex" }).click();
  await signCard.getByLabel("Payload").fill(vector.payloadInput);
  await signCard.getByRole("button", { name: "Show signing key" }).click();
  await signCard.getByLabel("Signing key").fill(vector.signingKeyBech32);

  const signatureCard = page.getByRole("region", { name: "Signature" });
  await expect(signatureCard.getByText(vector.verificationKeyBech32)).toBeVisible();
  await expect(signatureCard.getByText(vector.signatureHex)).toBeVisible();

  const verifyCard = page.getByRole("region", { name: "Verify signature" });
  await verifyCard.getByRole("button", { name: "Use signed payload" }).click();
  await expect(verifyCard.getByText("Valid signature")).toBeVisible();

  await verifyCard.getByLabel("Verification payload").fill("deadbeef00ff12");
  await expect(verifyCard.getByText("Invalid signature")).toBeVisible();
});

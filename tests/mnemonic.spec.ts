import { expect, test } from "@playwright/test";

test("mnemonic page generates mnemonics independently and can hand them off to restore", async ({
  page,
}) => {
  const restorePhraseField = page.locator(
    '[placeholder="abandon abandon ... or use the generated phrase"]',
  );

  await page.goto("/");

  await page.getByRole("button", { name: /Mnemonic Generate and hand off/ }).click();
  await expect(page.locator(".page-title")).toHaveText("Mnemonic Tools");

  await page.getByRole("button", { name: "12 words" }).click();
  await page.getByRole("button", { name: "Generate phrase" }).click();

  await expect(page.getByRole("button", { name: "Copy phrase" })).toBeVisible();
  await expect(
    page.getByText("Phrase hidden. 12 words are available for clipboard copy."),
  ).toBeVisible();
  await expect(page.locator(".mnemonic-word")).toHaveCount(0);

  await page.getByRole("button", { name: "Show phrase" }).click();
  await expect(page.locator(".mnemonic-word")).toHaveCount(12);

  await page.getByRole("button", { name: /Restore Choose family first/ }).click();
  await expect(page.locator(".page-title")).toHaveText("Restore And Build");
  await expect(restorePhraseField).toHaveValue("");

  await page.getByRole("button", { name: /Mnemonic Generate and hand off/ }).click();
  await expect(page.locator(".page-title")).toHaveText("Mnemonic Tools");
  await page.getByRole("button", { name: "Use in Restore" }).click();
  await page.getByRole("button", { name: /Restore Choose family first/ }).click();
  await expect(page.locator(".page-title")).toHaveText("Restore And Build");
  await expect(restorePhraseField).toHaveValue(/.+/);
});

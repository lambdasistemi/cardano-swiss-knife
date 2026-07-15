import { expect, test } from "@playwright/test";

test("mnemonic page generates mnemonics independently and can hand them off to restore", async ({
  page,
}) => {
  const restorePhraseField = page.getByLabel("Recovery phrase");

  await page.goto("/keys");

  await expect(page.getByRole("heading", { name: "Keys", exact: true })).toBeVisible();
  const tabs = page.getByRole("tablist", { name: "Key tools" });
  const mnemonicTab = tabs.getByRole("tab", { name: "Mnemonic", exact: true });
  const restoreTab = tabs.getByRole("tab", { name: "Restore", exact: true });
  await expect(mnemonicTab).toHaveAttribute("aria-selected", "true");

  await page.getByRole("button", { name: "12 words" }).click();
  await page.getByRole("button", { name: "Generate phrase" }).click();

  await expect(page.getByRole("button", { name: "Copy phrase" })).toBeVisible();
  await expect(
    page.getByText("Phrase hidden. 12 words are available for clipboard copy."),
  ).toBeVisible();
  await expect(page.locator(".mnemonic-word")).toHaveCount(0);

  await page.getByRole("button", { name: "Show phrase" }).click();
  await expect(page.locator(".mnemonic-word")).toHaveCount(12);

  await restoreTab.click();
  await expect(restoreTab).toHaveAttribute("aria-selected", "true");
  await expect(restorePhraseField).toHaveValue("");

  await mnemonicTab.click();
  await page.getByRole("button", { name: "Use in Restore" }).click();
  await restoreTab.click();
  await expect(restorePhraseField).toHaveValue(/.+/);
});

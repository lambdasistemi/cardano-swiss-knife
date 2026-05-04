import { expect, test } from "@playwright/test";

const shelleyAddress =
  "addr1vyeq0sedsphv9j4u0rlhakrfh5cf3d7mj0zrej92jw44n6c0fpycd";

test("inspect page decodes a Shelley address", async ({ page }) => {
  const consoleLogs: string[] = [];
  page.on("console", (msg) => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));
  page.on("pageerror", (err) => consoleLogs.push(`[pageerror] ${err.message}`));

  await page.goto("/");

  await page.getByRole("button", { name: /Inspect Decode addresses/ }).click();
  await expect(page.locator(".page-title")).toHaveText("Address Inspection");

  await expect(
    page.getByText(
      "No address inspected yet. Supported today: Shelley bech32 plus Byron and Icarus base58 inspection.",
    ),
  ).toBeVisible();

  await page.getByPlaceholder("addr1... or DdzFF...").fill(shelleyAddress);
  await page.getByRole("button", { name: "Inspect address" }).click();

  // Wait briefly for WASM call to complete, then dump page state
  await page.waitForTimeout(10000);
  const html = await page.content();
  const inspectSection = html.match(/Inspection result[\s\S]{0,1000}/)?.[0] || "section not found";
  console.log("PAGE STATE:", inspectSection.slice(0, 500));
  console.log("CONSOLE LOGS:", consoleLogs.join(" | "));

  // Wait for either a result or an error after WASM call
  const resultOrError = page.locator(".result-grid, .result-error");
  await expect(resultOrError).toBeVisible({ timeout: 5000 });

  // If there's an error, fail with the error text for debugging
  const errorEl = page.locator(".result-error");
  if (await errorEl.isVisible()) {
    const errorText = await errorEl.textContent();
    throw new Error(`Inspect returned error: ${errorText}\nConsole: ${consoleLogs.join("\n")}`);
  }

  // If neither result nor error, dump console for debugging
  const resultVisible = await page.locator(".result-grid").isVisible();
  if (!resultVisible) {
    throw new Error(`No result rendered.\nConsole: ${consoleLogs.join("\n")}`);
  }

  await expect(page.getByText("Shelley")).toBeVisible();
  await expect(page.getByText("Enterprise address (key)")).toBeVisible();
  await expect(page.getByText("Mainnet")).toBeVisible();
  await expect(
    page.getByText("3207c32d806ec2cabc78ff7ed869bd3098b7db93c43cc8aa93ab59eb"),
  ).toBeVisible();
});

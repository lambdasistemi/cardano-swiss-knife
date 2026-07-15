import { expect, test } from "@playwright/test";

const shelleyAddress =
  "addr1vyeq0sedsphv9j4u0rlhakrfh5cf3d7mj0zrej92jw44n6c0fpycd";

test("addresses page decodes a Shelley address", async ({ page }) => {
  const consoleLogs: string[] = [];
  page.on("console", (msg) => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));
  page.on("pageerror", (err) => consoleLogs.push(`[pageerror] ${err.message}`));

  await page.goto("/addresses");

  await expect(page).toHaveURL(/\/addresses\/?$/);
  await expect(page.getByRole("heading", { name: "Address inspection" })).toBeVisible();

  await expect(
    page.getByText(
      "Paste an address and inspect it to see its ledger structure.",
    ),
  ).toBeVisible();

  await page.getByLabel("Cardano address").fill(shelleyAddress);
  await page.getByRole("button", { name: "Inspect address" }).click();

  // Wait briefly for WASM call to complete, then dump page state
  await page.waitForTimeout(10000);
  const html = await page.content();
  const inspectSection = html.match(/Inspection result[\s\S]{0,1000}/)?.[0] || "section not found";
  console.log("PAGE STATE:", inspectSection.slice(0, 500));
  console.log("CONSOLE LOGS:", consoleLogs.join(" | "));

  // Wait for either a result or an error after WASM call
  const resultOrError = page.locator(".tool-result-grid, .tool-error");
  await expect(resultOrError).toBeVisible({ timeout: 5000 });

  // If there's an error, fail with the error text for debugging
  const errorEl = page.locator(".tool-error");
  if (await errorEl.isVisible()) {
    const errorText = await errorEl.textContent();
    throw new Error(`Inspect returned error: ${errorText}\nConsole: ${consoleLogs.join("\n")}`);
  }

  // If neither result nor error, dump console for debugging
  const resultVisible = await page.locator(".tool-result-grid").isVisible();
  if (!resultVisible) {
    throw new Error(`No result rendered.\nConsole: ${consoleLogs.join("\n")}`);
  }

  const result = page.getByRole("region", { name: "Address inspection result" });
  await expect(result.getByText("Shelley", { exact: true })).toBeVisible();
  await expect(
    result.getByText("Enterprise address (key)", { exact: true }),
  ).toBeVisible();
  await expect(result.getByText("Mainnet", { exact: true })).toBeVisible();
  await expect(
    result.getByText(
      "3207c32d806ec2cabc78ff7ed869bd3098b7db93c43cc8aa93ab59eb",
      { exact: true },
    ),
  ).toBeVisible();
});

test("unified publication exposes the exact primary navigation at canonical and compatibility entries", async ({
  page,
}) => {
  const expectedNavigation = [
    "Workbench",
    "Addresses",
    "Keys",
    "Scripts",
    "Vault",
    "Library",
    "Settings",
  ];
  const entries = [
    "/",
    "/inspect",
    "/addresses",
    "/keys",
    "/scripts",
    "/vault",
    "/library",
    "/settings",
    "/inspector/",
    "/inspector/inspect",
    "/inspector/addresses",
    "/inspector/keys",
    "/inspector/scripts",
    "/inspector/vault",
    "/inspector/library",
    "/inspector/settings",
  ];

  for (const entry of entries) {
    const response = await page.goto(entry);
    expect(response?.status(), entry).toBe(200);
    await expect(page.locator("#app"), entry).not.toBeEmpty();
    const navigation = page.getByRole("navigation", { name: "Primary" });
    expect(await navigation.getByRole("link").allTextContents(), entry).toEqual(
      expectedNavigation,
    );
  }
});

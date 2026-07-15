import { expect, test } from "@playwright/test";

const shelleyAddress =
  "addr1vyeq0sedsphv9j4u0rlhakrfh5cf3d7mj0zrej92jw44n6c0fpycd";
const spendingKeyHash =
  "3207c32d806ec2cabc78ff7ed869bd3098b7db93c43cc8aa93ab59eb";
const validScriptCborHex =
  "008200581c3207c32d806ec2cabc78ff7ed869bd3098b7db93c43cc8aa93ab59eb";
const validScriptJson =
  '"addr_vkh1xgruxtvqdmpv40rclalds6daxzvt0kuncs7v325n4dv7kz46hgj"';
const validScriptHashHex =
  "558ba956d2a19cecd37cb49d3f0ddff1985013dd86e695128bc3d996";
const validScriptHashBech32 =
  "script12k96j4kj5xwwe5mukjwn7rwl7xv9qy7asmnf2y5tc0vevku89av";
const warningScriptCborHex =
  "008202838200581c3207c32d806ec2cabc78ff7ed869bd3098b7db93c43cc8aa93ab59eb8204182a82051901f4";
const warningScriptHashHex =
  "677ee2d9c71c40eff5a252dba6e4289f03f590d67824f7b7282bf253";
const validTemplateJson =
  '{"cosigners":{"cosigner#0":"11840384ddea20045a0c7cc4bebccae1beacd2496c44ee527c3ac14a196056cdbafa73dfc71f106449ebf1913d8ab698738ff5dfc6f3259f0bfdfc62ea684b3c","cosigner#1":"d89c238b913d2f45f99a4ac1bc1647a4f1e5f79660cbfc1ef8d754beb5bb8e89150aeb3bfe5c0cfb0ae68c1f6020116a17b16479a7d23218a4ee56220c4cdcd1"},"template":{"all":["cosigner#0",{"any":["cosigner#1",{"active_from":120}]}]}}';
const validTemplateHashHex =
  "3041e1347320127264214c12fff0e9c89206b5ea40d32d7dfbc896de";
const invalidTemplateJson =
  '{"cosigners":{"cosigner#0":"11840384ddea20045a0c7cc4bebccae1beacd2496c44ee527c3ac14a196056cdbafa73dfc71f106449ebf1913d8ab698738ff5dfc6f3259f0bfdfc62ea684b3c","cosigner#1":"11840384ddea20045a0c7cc4bebccae1beacd2496c44ee527c3ac14a196056cdbafa73dfc71f106449ebf1913d8ab698738ff5dfc6f3259f0bfdfc62ea684b3c"},"template":{"all":["cosigner#0","cosigner#1"]}}';

test("addresses direct entry decodes a Shelley address through shared WASM", async ({
  page,
}) => {
  await page.goto("/addresses");

  await expect(page).toHaveURL(/\/addresses\/?$/);
  await expect(
    page.getByRole("heading", { name: "Address inspection" }),
  ).toBeVisible();
  await page.getByLabel("Cardano address").fill(shelleyAddress);
  await page.getByRole("button", { name: "Inspect address" }).click();

  const result = page.getByRole("region", { name: "Address inspection result" });
  await expect(result.getByText("Shelley", { exact: true })).toBeVisible();
  await expect(
    result.getByText("Enterprise address (key)", { exact: true }),
  ).toBeVisible();
  await expect(result.getByText("Mainnet", { exact: true })).toBeVisible();
  await expect(result.getByText(spendingKeyHash, { exact: true })).toBeVisible();
});

test("scripts navigation analyzes valid native-script CBOR", async ({ page }) => {
  await page.goto("/inspect");
  const scriptsLink = page.getByRole("link", { name: "Scripts", exact: true });
  await expect(scriptsLink).toBeVisible();
  await scriptsLink.click();

  await expect(page).toHaveURL(/\/scripts\/?$/);
  await expect(page.getByRole("heading", { name: "Native scripts" })).toBeVisible();
  await page.getByLabel("Native script CBOR hex").fill(validScriptCborHex);

  const result = page.getByRole("region", { name: "Script analysis result" });
  await expect(result.getByText("Signature", { exact: true })).toBeVisible();
  await expect(result.getByText("valid", { exact: true })).toBeVisible();
  await expect(result.getByText(validScriptHashHex, { exact: true })).toBeVisible();
  await expect(result.getByText(validScriptHashBech32, { exact: true })).toBeVisible();

  await page.getByLabel("Native script CBOR hex").fill(
    "00 82\n00\t58 1c 3207c32d806ec2cabc78ff7ed869bd3098b7db93c43cc8aa93ab59eb",
  );
  await expect(result.getByText("Signature", { exact: true })).toBeVisible();
  await expect(result.getByText("valid", { exact: true })).toBeVisible();
  await expect(result.getByText(validScriptHashHex, { exact: true })).toBeVisible();
  await expect(result.getByText(validScriptHashBech32, { exact: true })).toBeVisible();
});

test("scripts authors canonical native-script CBOR from JSON", async ({ page }) => {
  await page.goto("/scripts");

  const jsonTab = page.getByRole("tab", { name: "JSON", exact: true });
  await expect(jsonTab).toBeVisible();
  await jsonTab.click();
  await page.getByLabel("Native script JSON").fill(validScriptJson);

  const result = page.getByRole("region", { name: "Script analysis result" });
  await expect(result.getByText(validScriptJson, { exact: true })).toBeVisible();
  await expect(result.getByText(validScriptCborHex, { exact: true })).toBeVisible();
  await expect(result.getByText(validScriptHashHex, { exact: true })).toBeVisible();
});

test("scripts analyzes a valid ScriptTemplate", async ({ page }) => {
  await page.goto("/scripts");

  const templateTab = page.getByRole("tab", { name: "Template JSON" });
  await expect(templateTab).toBeVisible();
  await templateTab.click();
  await page.getByLabel("ScriptTemplate JSON").fill(validTemplateJson);

  const result = page.getByRole("region", { name: "Script analysis result" });
  const templateValidation = result.locator(".tool-kv-row", {
    hasText: "Template validation",
  });
  await expect(templateValidation.getByText("valid", { exact: true })).toBeVisible();
  await expect(result.getByText("Derived script type", { exact: true })).toBeVisible();
  await expect(result.getByText(validTemplateHashHex, { exact: true })).toBeVisible();
});

test("scripts surfaces duplicate-cosigner ScriptTemplate validation", async ({
  page,
}) => {
  await page.goto("/scripts");

  const templateTab = page.getByRole("tab", { name: "Template JSON" });
  await expect(templateTab).toBeVisible();
  await templateTab.click();
  await page.getByLabel("ScriptTemplate JSON").fill(invalidTemplateJson);

  const result = page.getByRole("region", { name: "Script analysis result" });
  await expect(result.getByText("error", { exact: true })).toBeVisible();
  await expect(
    result.getByText(
      "The cosigners in a script template must stand behind an unique extended public key.",
    ),
  ).toBeVisible();
  await expect(
    result.getByText("Unavailable until the template validates.", { exact: true }),
  ).toBeVisible();
});

test("scripts keeps awkward-script warnings and canonical hash visible", async ({
  page,
}) => {
  await page.goto("/scripts");

  const cborInput = page.getByLabel("Native script CBOR hex");
  await expect(cborInput).toBeVisible();
  await cborInput.fill(warningScriptCborHex);

  const result = page.getByRole("region", { name: "Script analysis result" });
  await expect(result.getByText("Any", { exact: true })).toBeVisible();
  await expect(result.getByText("warning", { exact: true })).toBeVisible();
  await expect(result.getByText(warningScriptHashHex, { exact: true })).toBeVisible();
  await expect(
    result.getByText("Script contains redundant timelock constraints."),
  ).toBeVisible();
});

test("addresses and scripts stay reachable in the responsive MD3 shell", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/inspect");

  const navigation = page.getByRole("navigation", { name: "Primary" });
  for (const destination of ["Workbench", "Addresses", "Scripts", "Library", "Settings"]) {
    await expect(
      navigation.getByRole("link", { name: destination, exact: true }),
    ).toBeVisible();
  }

  await navigation.getByRole("link", { name: "Addresses", exact: true }).click();
  await expect(page).toHaveURL(/\/addresses\/?$/);
  await expect(page.getByLabel("Cardano address")).toBeVisible();

  await navigation.getByRole("link", { name: "Scripts", exact: true }).click();
  await expect(page).toHaveURL(/\/scripts\/?$/);
  await expect(page.getByLabel("Native script CBOR hex")).toBeVisible();

  const horizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(horizontalOverflow).toBeLessThanOrEqual(1);
});

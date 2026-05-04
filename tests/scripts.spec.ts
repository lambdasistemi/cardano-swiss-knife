import { expect, test } from "@playwright/test";

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

test("scripts page analyzes valid native script CBOR", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: /Scripts Hash native scripts/ }).click();
  await expect(page.getByRole("heading", { name: "Native Scripts" })).toBeVisible();

  await page.getByPlaceholder("8200581c...").fill(validScriptCborHex);

  await expect(page.getByText("Signature", { exact: true })).toBeVisible();
  await expect(page.getByText("valid", { exact: true })).toBeVisible();
  await expect(page.getByText(validScriptHashHex, { exact: true })).toBeVisible();
  await expect(page.getByText(validScriptHashBech32, { exact: true })).toBeVisible();
});

test("scripts page authors native scripts from JSON", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: /Scripts Hash native scripts/ }).click();
  await expect(page.getByRole("heading", { name: "Native Scripts" })).toBeVisible();

  await page.getByRole("button", { name: "JSON", exact: true }).click();
  await page
    .getByPlaceholder('{"all":["addr_vkh1...",{"active_from":120}]}')
    .fill(validScriptJson);

  await expect(page.getByText("Signature", { exact: true })).toBeVisible();
  await expect(page.getByText(validScriptJson, { exact: true })).toBeVisible();
  await expect(page.getByText(validScriptCborHex, { exact: true })).toBeVisible();
  await expect(page.getByText(validScriptHashHex, { exact: true })).toBeVisible();
});

test("scripts page analyzes ScriptTemplate JSON", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: /Scripts Hash native scripts/ }).click();
  await expect(page.getByRole("heading", { name: "Native Scripts" })).toBeVisible();

  await page.getByRole("button", { name: "Template JSON" }).click();
  await page
    .getByPlaceholder('{"cosigners":{"cosigner#0":"<xpub-hex>"},"template":"cosigner#0"}')
    .fill(validTemplateJson);

  await expect(
    page.locator("div").filter({ hasText: /^Template validationvalid$/ }).getByRole("code"),
  ).toBeVisible();
  await expect(page.getByText(validTemplateHashHex, { exact: true })).toBeVisible();
  await expect(page.getByText("Derived script type", { exact: true })).toBeVisible();
});

test("scripts page surfaces ScriptTemplate validation failures", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: /Scripts Hash native scripts/ }).click();
  await expect(page.getByRole("heading", { name: "Native Scripts" })).toBeVisible();

  await page.getByRole("button", { name: "Template JSON" }).click();
  await page
    .getByPlaceholder('{"cosigners":{"cosigner#0":"<xpub-hex>"},"template":"cosigner#0"}')
    .fill(invalidTemplateJson);

  await expect(page.getByText("error", { exact: true })).toBeVisible();
  await expect(
    page.getByText(
      "The cosigners in a script template must stand behind an unique extended public key.",
    ),
  ).toBeVisible();
  await expect(
    page.getByText("Unavailable until the template validates.", { exact: true }),
  ).toBeVisible();
});

test("scripts page shows validation warnings for awkward scripts", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: /Scripts Hash native scripts/ }).click();
  await expect(page.getByRole("heading", { name: "Native Scripts" })).toBeVisible();

  await page.getByPlaceholder("8200581c...").fill(warningScriptCborHex);

  await expect(page.getByText("Any", { exact: true })).toBeVisible();
  await expect(page.getByText("warning", { exact: true })).toBeVisible();
  await expect(page.getByText(warningScriptHashHex, { exact: true })).toBeVisible();
  await expect(
    page.getByText("Script contains redundant timelock constraints."),
  ).toBeVisible();
});

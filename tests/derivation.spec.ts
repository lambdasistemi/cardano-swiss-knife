import { expect, test } from "@playwright/test";

const mnemonic =
  "message mask aunt wheel ten maze between tomato slow analyst ladder such report capital produce";
const firstAddressPublicKey =
  "addr_xvk1gs3fqwhyayz2drdx857yw7jyvnjqsje2sc7qlx4ryp8z4cpvh4hn4tnjeqqtultplcgwp067389dy5fafmnqtreus6tju0ueyrjnynq0l3lh3";
const secondAddressPublicKey =
  "addr_xvk1lz7rn3xtrxuk9gn38gzpd9rjpknlu9758z70hkl9wu79hc7xqw7fxu57u5r4xcyjrxl7q0j9533zv2mnsqhzmkpxw50lqmcdn7f5m7s943403";
const shelleyMainnetPayment =
  "addr1vyeq0sedsphv9j4u0rlhakrfh5cf3d7mj0zrej92jw44n6c0fpycd";
const shelleyMainnetDelegation =
  "addr1qyeq0sedsphv9j4u0rlhakrfh5cf3d7mj0zrej92jw44n6mtqeal07vnfl5epes85ce4rgry2wsmw3h77yt0szdk9crs0x5ygs";
const shelleyMainnetReward =
  "addr1u94sv7lhlxf5l6vsucr6vv635pj98gdhgml0z9hcpxmzupc80twrd";
const shelleyPreprodPayment =
  "addr_test1vqeq0sedsphv9j4u0rlhakrfh5cf3d7mj0zrej92jw44n6c5p4chg";
const shelleyPreprodDelegation =
  "addr_test1qqeq0sedsphv9j4u0rlhakrfh5cf3d7mj0zrej92jw44n6mtqeal07vnfl5epes85ce4rgry2wsmw3h77yt0szdk9crsvsfyy0";
const shelleyPreprodReward =
  "addr_test1up4sv7lhlxf5l6vsucr6vv635pj98gdhgml0z9hcpxmzupcu8ljvg";
const icarusAddress =
  "Ae2tdPwUPEZKdwAH18yuA45Fa5pdhm638CpF8MrG6999cMiwdzEWetEFJBk";
const byronAddress =
  "2w1sdSJu3GVidw5zyVHtVm3XTzpV8w68W8XLnWybAXYYZzD1iY2ET21Etah5unPjYbUnr1VqEr5bkF1N8SaV4Ec9pxnPHLVXD5Q";

test("derivation page is reactive and hides values in private mode", async ({
  page,
}) => {
  await page.goto("/");

  await page.getByRole("button", { name: /Restore Choose family first/ }).click();
  await expect(page.locator("h2.page-title", { hasText: "Restore And Build" })).toBeVisible();

  const mnemonicInput = page.locator(
    'input[type="password"][placeholder="abandon abandon ... or use the generated phrase"]',
  );
  await mnemonicInput.fill(mnemonic);

  await expect(page.getByText("Private key hidden for this card. Use Show or Copy.").first()).toBeVisible();
  await expect(page.getByText(firstAddressPublicKey)).toBeVisible();

  await page.getByRole("button", { name: "Show private keys" }).click();
  await expect(page.getByText(firstAddressPublicKey)).toBeVisible();

  await page.getByRole("spinbutton", { name: "Address index" }).fill("1");
  await expect(page.getByText(secondAddressPublicKey)).toBeVisible();
  await expect(page.getByText(firstAddressPublicKey)).toHaveCount(0);
});

test("restore page switches family semantics from the same mnemonic", async ({
  page,
}) => {
  await page.goto("/");

  await page.getByRole("button", { name: /Restore Choose family first/ }).click();
  await expect(page.locator("h2.page-title", { hasText: "Restore And Build" })).toBeVisible();

  const mnemonicInput = page.locator(
    'input[type="password"][placeholder="abandon abandon ... or use the generated phrase"]',
  );
  await mnemonicInput.fill(mnemonic);

  await page.getByRole("button", { name: "Show private keys" }).click();
  await expect(page.getByText(firstAddressPublicKey)).toBeVisible();

  await page.getByRole("button", { name: "Icarus" }).click();
  await expect(page.getByText(icarusAddress)).toBeVisible();
  await expect(page.getByText(firstAddressPublicKey)).toHaveCount(0);

  await page.getByRole("button", { name: "Byron" }).click();
  await expect(page.getByText(byronAddress)).toBeVisible();
  await expect(page.getByText(icarusAddress)).toHaveCount(0);
});

test("restore page builds Shelley addresses for the selected network while keeping public outputs visible", async ({
  page,
}) => {
  await page.goto("/");

  await page.getByRole("button", { name: /Restore Choose family first/ }).click();
  await expect(page.locator(".page-title")).toHaveText("Restore And Build");

  const mnemonicInput = page.locator(
    'input[type="password"][placeholder="abandon abandon ... or use the generated phrase"]',
  );
  await mnemonicInput.fill(mnemonic);

  await expect(page.getByText(shelleyMainnetPayment)).toBeVisible();
  await expect(page.getByText(shelleyMainnetDelegation)).toBeVisible();
  await expect(page.getByText(shelleyMainnetReward)).toBeVisible();
  await expect(page.getByText("Private key hidden for this card. Use Show or Copy.").first()).toBeVisible();

  await page.getByRole("button", { name: "Preprod" }).click();
  await expect(page.getByText(shelleyPreprodPayment)).toBeVisible();
  await expect(page.getByText(shelleyPreprodDelegation)).toBeVisible();
  await expect(page.getByText(shelleyPreprodReward)).toBeVisible();
  await expect(page.getByText(shelleyMainnetPayment)).toHaveCount(0);

  await page.getByRole("button", { name: "Stake" }).click();
  await expect(
    page.getByText("Unavailable when the selected role does not derive a payment credential."),
  ).toHaveCount(2);
  await expect(page.getByText(shelleyPreprodReward)).toBeVisible();
});

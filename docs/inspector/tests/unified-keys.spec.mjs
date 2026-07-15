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

const icarusAddressXPub =
  "addr_xvk12q8m3slawygjfu4kejfkpmkhxwtqnhh6h422d9rvn4y5duqck6uugzq73gcwwz6rm558t4ze48unnalalxzcj23tjand8fr83lnllss86krr5";
const icarusCustomAddress =
  "5oP9ib6ym3XaoKRhCGk3Zfv2HAHRA7r8zZeSUVhzSL3pM5JEjt7MSk5T4EJJpzmpVR";
const byronAddressXPub =
  "addr_xvk154775y260zd4yu90gw8k74muunmr39dlvztzs5p3cvnk0smpvehs23stg9uxz3zdpu0ex5gxpugj5cjad4m8knlnzprzk40nwl8felc420xwu";
const byronCustomAddressXPub =
  "addr_xvk1c5r48ulyvlfe834vjt4vl9uswy2enq9evn7hllqhnv65wcq7yvtqmtpp9064pkq8c59lyucvfx7gvyjdupk9grsw8tg7gj50854t7ycuux4qa";
const byronRootXPub =
  "root_xvk1rcntpytsyd3q9qfdfdyl6ud2ea5qurxg9q6ns5w07lu2j7299kl8j0tmc5phyqqgwu2dgw95nu549gkuq05l800h7prtuuj7gr5umvc7gfagw";
const byronCustomAddress =
  "xnFfw9Z3oh5idKW2ehvM1HJFgir7frn86jNL7jGsiFS3KTyyEAvcNEhsBv3NADSKyLnFF3NMhGoKzeCkcZY9stkQK8h96MoFL2snVCoH4";

const signingVector = {
  payloadInput: "deadbeef00ff11",
  signatureHex:
    "294fa694b3d145eb443ee114536caf250f68740028d59f2ba7a3b047568188f7256fd256183ca3544051f0fbd53b2f4f1bcde06df3d85c9ba4135ec3cc8cb700",
  signingKeyBech32:
    "addr_xsk1wzrez8tt80xnnll3q0p70edlhnu04nu8xhrdtnpucd3z5g7ghfgp7tlqlu73esn25ck83z2maj0zv0ktwfas3un27jm02dggqeg3hlf64eevsq9704sluy8qha0gnjkj2y75aes93u7gd9ew87vjpefjfsfhd84l",
  verificationKeyBech32: firstAddressPublicKey,
};

test("keys direct entry exposes four stateful tabs and mnemonic handoff", async ({
  page,
}) => {
  await page.goto("/keys");

  await expect(page).toHaveURL(/\/keys\/?$/);
  await expect(page.getByRole("heading", { name: "Keys" })).toBeVisible();
  const tabs = page.getByRole("tablist", { name: "Key tools" });
  expect(await tabs.getByRole("tab").allTextContents()).toEqual([
    "Mnemonic",
    "Restore",
    "Expert",
    "Sign & verify",
  ]);

  const mnemonicTab = tabs.getByRole("tab", { name: "Mnemonic", exact: true });
  await expect(mnemonicTab).toHaveAttribute("aria-selected", "true");
  await page.getByRole("button", { name: "12 words" }).click();
  await page.getByRole("button", { name: "Generate phrase" }).click();
  await expect(
    page.getByText("Phrase hidden. 12 words are available for clipboard copy."),
  ).toBeVisible();
  await expect(page.locator(".mnemonic-word")).toHaveCount(0);

  await page.getByRole("button", { name: "Show phrase" }).click();
  await expect(page.locator(".mnemonic-word")).toHaveCount(12);
  await page.getByRole("button", { name: "Use in Restore" }).click();

  const restoreTab = tabs.getByRole("tab", { name: "Restore", exact: true });
  await restoreTab.click();
  await expect(restoreTab).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel("Recovery phrase")).toHaveValue(/.+/);
  await expect(page.getByLabel("Recovery phrase")).toHaveAttribute("type", "password");

  await mnemonicTab.click();
  await expect(page.locator(".mnemonic-word")).toHaveCount(12);
});

test("restore derives reactive Shelley keys and network addresses with private values hidden", async ({
  page,
}) => {
  await page.goto("/keys");
  await page.getByRole("tab", { name: "Restore", exact: true }).click();

  await page.getByLabel("Recovery phrase").fill(mnemonic);
  await expect(page.getByText(firstAddressPublicKey, { exact: true })).toBeVisible();
  await expect(page.getByText(shelleyMainnetPayment, { exact: true })).toBeVisible();
  await expect(page.getByText(shelleyMainnetDelegation, { exact: true })).toBeVisible();
  await expect(page.getByText(shelleyMainnetReward, { exact: true })).toBeVisible();
  await expect(
    page.getByText("Private key hidden for this card. Use Show or Copy.").first(),
  ).toBeVisible();
  await expect(page.getByText("m / 1852' / 1815' / 0' / 0 / 0", { exact: true })).toBeVisible();

  await page.getByRole("spinbutton", { name: "Address index" }).fill("1");
  await expect(page.getByText(secondAddressPublicKey, { exact: true })).toBeVisible();
  await expect(page.getByText(firstAddressPublicKey, { exact: true })).toHaveCount(0);
  await expect(page.getByText("m / 1852' / 1815' / 0' / 0 / 1", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Show private keys" }).click();
  await expect(page.getByText(/^root_xsk1/)).toBeVisible();

  await page.getByRole("spinbutton", { name: "Address index" }).fill("0");
  await page.getByRole("button", { name: "Preprod" }).click();
  await expect(page.getByText(shelleyPreprodPayment, { exact: true })).toBeVisible();
  await expect(page.getByText(shelleyPreprodDelegation, { exact: true })).toBeVisible();
  await expect(page.getByText(shelleyPreprodReward, { exact: true })).toBeVisible();
  await expect(page.getByText(shelleyMainnetPayment, { exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Stake", exact: true }).click();
  await expect(
    page.getByText(
      "Unavailable when the selected role does not derive a payment credential.",
    ),
  ).toHaveCount(2);
  await expect(page.getByText(shelleyPreprodReward, { exact: true })).toBeVisible();
});

test("restore switches family-first Icarus and Byron semantics", async ({ page }) => {
  await page.goto("/keys");
  await page.getByRole("tab", { name: "Restore", exact: true }).click();
  await page.getByLabel("Recovery phrase").fill(mnemonic);

  await page.getByRole("button", { name: "Icarus", exact: true }).click();
  await expect(page.getByText(icarusAddress, { exact: true })).toBeVisible();
  await expect(page.getByText(firstAddressPublicKey, { exact: true })).toHaveCount(0);
  await expect(page.getByText("m / 44' / 1815' / 0' / 0 / 0", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Byron", exact: true }).click();
  await expect(page.getByText(byronAddress, { exact: true })).toBeVisible();
  await expect(page.getByText(icarusAddress, { exact: true })).toHaveCount(0);
  await expect(page.getByText("m / 0' / 0", { exact: true })).toBeVisible();
});

test("expert constructs exact Icarus and Byron bootstrap fixtures", async ({ page }) => {
  await page.goto("/keys");
  await page.getByRole("tab", { name: "Expert", exact: true }).click();

  await page.getByLabel("Address xpub").fill(icarusAddressXPub);
  await expect(page.getByText(icarusAddress, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Custom", exact: true }).click();
  await page.getByRole("spinbutton", { name: "Protocol magic" }).fill("4242");
  await expect(page.getByText(icarusCustomAddress, { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Byron", exact: true }).click();
  await page.getByLabel("Root xpub").fill(byronRootXPub);
  await page.getByLabel("Byron path").fill("0H/14");
  await page.getByLabel("Address xpub").fill(byronCustomAddressXPub);
  await expect(page.getByText(byronCustomAddress, { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Mainnet", exact: true }).click();
  await page.getByLabel("Byron path").fill("0H/0");
  await page.getByLabel("Address xpub").fill(byronAddressXPub);
  await expect(page.getByText(byronAddress, { exact: true })).toBeVisible();
});

test("sign and verify renders the exact generic payload fixture", async ({ page }) => {
  await page.goto("/keys");
  await page.getByRole("tab", { name: "Sign & verify", exact: true }).click();

  const signCard = page.getByRole("region", { name: "Sign payload" });
  await signCard.getByRole("button", { name: "Hex", exact: true }).click();
  await signCard.getByLabel("Payload").fill(signingVector.payloadInput);
  await signCard.getByRole("button", { name: "Show signing key" }).click();
  await signCard.getByLabel("Signing key").fill(signingVector.signingKeyBech32);

  const signatureCard = page.getByRole("region", { name: "Signature" });
  await expect(
    signatureCard.getByText(signingVector.verificationKeyBech32, { exact: true }),
  ).toBeVisible();
  await expect(
    signatureCard.getByText(signingVector.signatureHex, { exact: true }),
  ).toBeVisible();

  const verifyCard = page.getByRole("region", { name: "Verify signature" });
  await verifyCard.getByRole("button", { name: "Use signed payload" }).click();
  await expect(verifyCard.getByText("Valid signature", { exact: true })).toBeVisible();
  await verifyCard.getByLabel("Verification payload").fill("deadbeef00ff12");
  await expect(verifyCard.getByText("Invalid signature", { exact: true })).toBeVisible();
});

test("keys is reachable in the exact partial navigation without mobile overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/inspect");

  const navigation = page.getByRole("navigation", { name: "Primary" });
  expect(await navigation.getByRole("link").allTextContents()).toEqual([
    "Inspect",
    "Addresses",
    "Keys",
    "Scripts",
    "Library",
    "Settings",
  ]);
  await navigation.getByRole("link", { name: "Keys", exact: true }).click();
  await expect(page).toHaveURL(/\/keys\/?$/);
  await expect(page.getByRole("tab", { name: "Mnemonic", exact: true })).toBeVisible();

  const horizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(horizontalOverflow).toBeLessThanOrEqual(1);
});

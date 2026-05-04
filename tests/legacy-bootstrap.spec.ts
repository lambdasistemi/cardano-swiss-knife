import { expect, test } from "@playwright/test";

const icarusAddressXPub =
  "addr_xvk12q8m3slawygjfu4kejfkpmkhxwtqnhh6h422d9rvn4y5duqck6uugzq73gcwwz6rm558t4ze48unnalalxzcj23tjand8fr83lnllss86krr5";
const icarusExpectedAddress =
  "Ae2tdPwUPEZKdwAH18yuA45Fa5pdhm638CpF8MrG6999cMiwdzEWetEFJBk";
const icarusCustomExpectedAddress =
  "5oP9ib6ym3XaoKRhCGk3Zfv2HAHRA7r8zZeSUVhzSL3pM5JEjt7MSk5T4EJJpzmpVR";

const byronAddressXPub =
  "addr_xvk154775y260zd4yu90gw8k74muunmr39dlvztzs5p3cvnk0smpvehs23stg9uxz3zdpu0ex5gxpugj5cjad4m8knlnzprzk40nwl8felc420xwu";
const byronCustomAddressXPub =
  "addr_xvk1c5r48ulyvlfe834vjt4vl9uswy2enq9evn7hllqhnv65wcq7yvtqmtpp9064pkq8c59lyucvfx7gvyjdupk9grsw8tg7gj50854t7ycuux4qa";
const byronRootXPub =
  "root_xvk1rcntpytsyd3q9qfdfdyl6ud2ea5qurxg9q6ns5w07lu2j7299kl8j0tmc5phyqqgwu2dgw95nu549gkuq05l800h7prtuuj7gr5umvc7gfagw";
const byronExpectedAddress =
  "2w1sdSJu3GVidw5zyVHtVm3XTzpV8w68W8XLnWybAXYYZzD1iY2ET21Etah5unPjYbUnr1VqEr5bkF1N8SaV4Ec9pxnPHLVXD5Q";
const byronCustomExpectedAddress =
  "xnFfw9Z3oh5idKW2ehvM1HJFgir7frn86jNL7jGsiFS3KTyyEAvcNEhsBv3NADSKyLnFF3NMhGoKzeCkcZY9stkQK8h96MoFL2snVCoH4";

test("legacy page constructs Icarus and Byron bootstrap addresses", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Project Overview" })).toBeVisible();
  await page.getByRole("button", { name: /Expert Manual bootstrap xpubs/ }).click();
  await expect(
    page.locator("h2.page-title", { hasText: "Manual Bootstrap Construction" }),
  ).toBeVisible();

  const addressXPubArea = page.getByPlaceholder("addr_xvk1...");
  await addressXPubArea.fill(icarusAddressXPub);
  await expect(page.getByText(icarusExpectedAddress)).toBeVisible();

  await page.getByRole("button", { name: "Custom" }).click();
  await page.getByRole("spinbutton", { name: "Protocol magic" }).fill("4242");
  await expect(page.getByText(icarusCustomExpectedAddress)).toBeVisible();

  await page.getByRole("button", { name: "Byron" }).click();
  await page.getByPlaceholder("root_xvk1...").fill(byronRootXPub);
  await page.getByPlaceholder("0H/0").fill("0H/14");
  await addressXPubArea.fill(byronCustomAddressXPub);
  await expect(page.getByText(byronCustomExpectedAddress)).toBeVisible();

  await page.getByRole("button", { name: "Mainnet" }).click();
  await page.getByPlaceholder("0H/0").fill("0H/0");
  await addressXPubArea.fill(byronAddressXPub);
  await expect(page.getByText(byronExpectedAddress)).toBeVisible();
});

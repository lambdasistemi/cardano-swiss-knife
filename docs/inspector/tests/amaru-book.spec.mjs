import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");
const bookFfiPath = path.join(repoRoot, "lib/src/Cardano/Transaction/Book.js");
const journalPath = path.join(
  repoRoot,
  "docs/inspector/protocols/amaru-treasury/journal-2026.json",
);
const journal = readFileSync(journalPath, "utf8");

async function bookConstants() {
  const source = readFileSync(bookFfiPath, "utf8");
  return import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
}

test("browser library rejects arbitrary JSON through the shared PureScript facade", async ({ page }) => {
  await page.goto("/library");
  const library = page.locator(".library-page");
  await library.getByLabel("Book Turtle").fill('{"unrelated":true}');
  await library.getByRole("button", { name: "Add book" }).click();
  await expect(library.getByRole("alert")).toHaveText("Book import failed: unrecognized JSON shape.");
});

test("Book FFI contains only injected bundle constants", async () => {
  const source = readFileSync(bookFfiPath, "utf8");
  expect(source).not.toMatch(/parseBook|importBooks|blueprintArgs/);
});

test("bundled Amaru journal is injected from the vendored registry", async () => {
  const { bundledAmaruJournal } = await bookConstants();

  expect(JSON.parse(bundledAmaruJournal)).toEqual(JSON.parse(journal));
});

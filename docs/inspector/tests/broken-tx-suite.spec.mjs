// Verifies the "meaningfully wrong" example transactions actually fire their
// target Class-A / network SHACL shapes through the REAL pipeline:
// decode CBOR -> projected cardano: RDF -> SHACL. Unlike the crafted-Turtle
// Class-A test, this proves the decoder projects enough for each shape to fire
// on a genuinely decoded transaction. Doubles as the regression gate for the
// broken-tx examples picker.
import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");
const shapesPath = path.join(repoRoot, "docs/inspector/protocols/cardano-rdf/shapes.ttl");
const overlayBookPath = path.join(repoRoot, "docs/inspector/src/FFI/OverlayBook.js");
const brokenDir = path.join(
  repoRoot,
  "specs/001-ledger-functional-layer/fixtures/broken",
);
const manifest = JSON.parse(readFileSync(path.join(brokenDir, "manifest.json"), "utf8"));
const shapes = readFileSync(shapesPath, "utf8");

// Navigate without waiting for the ~36MB wasm to finish the `load` event
// (that is what hangs under runner load); wait explicitly for the decoder to
// initialise instead, and retry the navigation a couple of times to stay robust.
async function gotoApp(page) {
  page.setDefaultTimeout(30_000);
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.goto("/", { waitUntil: "domcontentloaded", timeout: 60_000 });
      await page.waitForFunction(
        () => typeof globalThis.txInspectorValidateShacl === "function",
        undefined,
        { timeout: 90_000 },
      );
      return;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

async function decodeHex(page, hex) {
  await gotoApp(page);
  await page.getByRole("tab", { name: "Paste CBOR" }).click();
  await page.getByPlaceholder("Paste Conway transaction CBOR hex").fill(hex);
  await page.getByRole("button", { name: "Decode" }).click();
  const resultPanel = page.locator(".result-panel");
  await expect(
    resultPanel.getByRole("tab", { name: "Structure" }),
  ).toHaveAttribute("aria-selected", "true");
  await resultPanel.getByRole("tab", { name: "Graph / RDF" }).click();
  const panel = resultPanel.getByRole("tabpanel", { name: "Graph / RDF" });
  await expect(panel).toBeVisible();
  return panel.locator(".rdf-turtle").innerText();
}

async function selectResultTab(page, name) {
  const resultPanel = page.locator(".result-panel");
  await resultPanel.getByRole("tab", { name }).click();
  const panel = resultPanel.getByRole("tabpanel", { name });
  await expect(panel).toBeVisible();
  return panel;
}

async function loadExample(page, label) {
  await gotoApp(page);
  await page.getByRole("button", { name: new RegExp(label) }).click();
  const resultPanel = page.locator(".result-panel");
  await expect(
    resultPanel.getByRole("tab", { name: "Structure" }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    resultPanel
      .getByRole("tabpanel", { name: "Structure" })
      .locator(".decoded-tree-row.decoded-tree-depth-0", { hasText: "Transaction" })
      .first(),
  ).toBeVisible();
}

async function expandDecodedStructure(page) {
  const panel = page.locator(".decoded-screen");
  for (let pass = 0; pass < 256; pass += 1) {
    const expanded = await panel.evaluate(async (root) => {
      const row = Array.from(
        root.querySelectorAll(".decoded-tree-row--group:not(.is-expanded)"),
      ).find(Boolean);
      if (!row) return false;
      row.click();
      await new Promise((resolve) => requestAnimationFrame(resolve));
      return true;
    });
    if (!expanded) return;
  }
}

function decodedRowWithKey(page, label) {
  return page.locator(".decoded-tree-row", {
    has: page.locator(".decoded-tree-key", {
      hasText: label,
    }),
  });
}

async function expectVerdictViolationsMatchChip(page) {
  const validationPanel = page.getByRole("tabpanel", { name: "Validation" });
  const chipText = await validationPanel
    .locator(".validation-filter-chip", { hasText: /^Violations\s+\d+$/ })
    .innerText();
  const chipCount = Number(chipText.match(/Violations\s+(\d+)/)?.[1]);
  expect(Number.isFinite(chipCount), `chip text: ${chipText}`).toBe(true);

  const bannerText = await validationPanel.locator(".validation-verdict-banner").innerText();
  const bannerCounts = [...bannerText.matchAll(/(\d+)\s+violations/g)].map((match) =>
    Number(match[1]),
  );
  expect(bannerCounts.length, `banner text: ${bannerText}`).toBeGreaterThan(0);
  expect(
    bannerCounts.every((count) => count === chipCount),
    `banner text: ${bannerText}; chip text: ${chipText}`,
  ).toBe(true);
}

test("bundled Cardano SHACL shapes match the protocol shapes file", async () => {
  const source = readFileSync(overlayBookPath, "utf8");
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
  const { bundledCardanoShaclShapes } = await import(moduleUrl);

  expect(bundledCardanoShaclShapes.trim()).toBe(shapes.trim());
});

for (const ex of manifest) {
  test(`${ex.slug} decodes and fires ${ex.shape}`, async ({ page }) => {
    test.setTimeout(180_000);
    const hex = readFileSync(path.join(brokenDir, `${ex.slug}.hex`), "utf8").trim();
    const turtle = await decodeHex(page, hex);
    const report = await page.evaluate(
      ({ data, s }) => globalThis.txInspectorValidateShacl(data, s),
      { data: turtle, s: shapes },
    );
    const messages = (report.violations || []).map((v) => v.message || "").join(" | ");
    expect(report.conforms, `${ex.slug} should be non-conforming; messages: ${messages}`).toBe(
      false,
    );
    expect(
      messages.includes(ex.shape),
      `${ex.slug} expected shape "${ex.shape}"; got: ${messages}`,
    ).toBe(true);
  });
}

test("examples picker loads and decodes a broken tx end to end", async ({ page }) => {
  test.setTimeout(180_000);
  await loadExample(page, "Empty input set");
  await selectResultTab(page, "Validation");
  await expect(page.locator(".shacl-conformance-panel")).toContainText(
    "InputSetEmptyUTxO",
  );
});

test("examples picker shows empty inputs as present and surfaces InputSetEmptyUTxO", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await loadExample(page, "Empty input set");
  await expandDecodedStructure(page);

  const inputsRow = decodedRowWithKey(page, /^inputs$/).first();
  await expect(inputsRow).toBeVisible();
  await expect(inputsRow).not.toHaveClass(/decoded-tree-empty-field/);
  await expect(inputsRow).toContainText("0 inputs");

  await selectResultTab(page, "Validation");
  await expectVerdictViolationsMatchChip(page);
  const shapeRow = page
    .locator(".shacl-violation-row", { hasText: "InputSetEmptyUTxO" })
    .first();
  await expect(shapeRow.locator(".validation-row-title-line strong")).toHaveText(
    "InputSetEmptyUTxO",
  );
  await expect(shapeRow).toContainText("transaction input set must not be empty");
});

test("examples picker surfaces NetworkConsistency for network mismatch", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await loadExample(page, "Network id mismatch");
  await expandDecodedStructure(page);

  const networkIdRow = decodedRowWithKey(page, /^network_id$/).first();
  await expect(networkIdRow).toBeVisible();
  await expect(networkIdRow).not.toHaveClass(/decoded-tree-empty-field/);
  await expect(networkIdRow).toContainText("0");

  await selectResultTab(page, "Validation");
  await expectVerdictViolationsMatchChip(page);
  const shapeRow = page
    .locator(".shacl-violation-row", { hasText: "NetworkConsistency" })
    .first();
  await expect(shapeRow.locator(".validation-row-title-line strong")).toHaveText(
    "NetworkConsistency",
  );
  await expect(shapeRow).toContainText("cardano:network literals must agree");
});

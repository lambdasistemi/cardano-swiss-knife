import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");
const bookPath = path.join(repoRoot, "lib/src/Cardano/Transaction/Book.js");
const journalPath = path.join(
  repoRoot,
  "docs/inspector/protocols/amaru-treasury/journal-2026.json",
);
const journal = readFileSync(journalPath, "utf8");

async function bookModule() {
  const source = readFileSync(bookPath, "utf8");
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(
    `globalThis.amaruTreasuryJournalJson=${JSON.stringify(journal)};\n${source}`,
  ).toString("base64")}`;
  return import(moduleUrl);
}

test("rejects arbitrary JSON without generating Amaru RDF", async () => {
  const { parseBook } = await bookModule();

  expect(() => parseBook('{"unrelated":true}')).toThrow(
    "unrecognized JSON shape",
  );
});

test("bundled Amaru journal is injected from the vendored registry", async () => {
  const { bundledAmaruJournal } = await bookModule();

  expect(JSON.parse(bundledAmaruJournal)).toEqual(JSON.parse(journal));
});

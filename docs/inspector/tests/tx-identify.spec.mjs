import { expect, test } from "@playwright/test";
import { createServer } from "node:http";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");
const conwayMainnetFixturePath = path.join(
  repoRoot,
  "specs/001-ledger-functional-layer/fixtures/conway-mainnet-tx.hex",
);
const fixturePath =
  process.env.TX_FIXTURE_PATH ||
  conwayMainnetFixturePath;
const signingIntentFixturePath = path.join(
  repoRoot,
  "specs/001-ledger-functional-layer/fixtures/sundae-swap-usdm-disbursement.hex",
);
const validationFixturePath = path.join(
  repoRoot,
  "specs/001-ledger-functional-layer/fixtures/tx-validate-complete-request.json",
);
const cardanoShaclShapesPath = path.join(
  repoRoot,
  "docs/inspector/protocols/cardano-rdf/shapes.ttl",
);
const attxBookBundlePath = path.join(
  repoRoot,
  "docs/inspector/tests/fixtures/attx-book-bundle.json",
);
const packagedSiteDir = path.resolve(
  process.cwd(),
  process.env.TX_INSPECTOR_SITE_DIR || "result",
);
const amaruTreasuryTxRoot =
  process.env.TX_AMARU_TREASURY_TX_ROOT || "/code/amaru-treasury-tx";
const amaruTreasuryTx2026Root = path.join(
  amaruTreasuryTxRoot,
  "transactions/2026",
);
const contingencyTxId =
  "18d57a4f104df4cc776104ce626958e2110122392e4c4c7671edc8861b48452e";
const previewPrefix = "/lambdasistemi/cardano-ledger-inspector/pr-99/";
const localBookStoreKey = "cardano-ledger-inspector.books.v1";
const pastedTurtleBook = `
@prefix cardano: <https://lambdasistemi.github.io/cardano-ledger-rdf/vocab/cardano#> .
@prefix overlay: <https://lambdasistemi.github.io/cardano-ledger-rdf/overlay/local#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

overlay:LocalTreasuryLabel
  a cardano:OverlayBook ;
  rdfs:label "Local treasury label" ;
  cardano:bech32 "addr1qx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzersv8z3z2w8" .
`;
const violatingShaclShapes = `
@prefix cardano: <https://lambdasistemi.github.io/cardano-ledger-rdf/vocab/cardano#> .
@prefix sh: <http://www.w3.org/ns/shacl#> .

cardano:TransactionShape
  a sh:NodeShape ;
  sh:targetClass cardano:Transaction ;
  sh:property cardano:RequiresSentinelShape .

cardano:RequiresSentinelShape
  sh:path cardano:requiresSentinel ;
  sh:minCount 1 ;
  sh:severity sh:Warning ;
  sh:message "Transactions must include sentinel off-spec marker." .
`;
const networkConsistencyMessage =
  "NetworkConsistency: cardano:network literals must agree with each other and the transaction body network id.";

function classATurtle({ includeInput = true, txPredicates = [], body = "" } = {}) {
  const predicates = [
    "cardano:hasTxId <urn:cardano:id:TxId:class-a>",
    ...(includeInput ? ["cardano:hasInput _:input1"] : []),
    ...txPredicates,
  ];
  const inputBody = includeInput
    ? `
_:input1 a cardano:Input ;
  cardano:txOutRef "0000000000000000000000000000000000000000000000000000000000000001#0" .
`
    : "";
  return `
@prefix cardano: <https://lambdasistemi.github.io/cardano-ledger-rdf/vocab/cardano#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

<urn:cardano:tx:class-a>
  a cardano:Transaction ;
  ${predicates.join(" ;\n  ")} .

<urn:cardano:id:TxId:class-a> a cardano:Identifier ;
  cardano:leafType "TxId" ;
  cardano:bytesHex "class-a" .
${inputBody}
${body}
`;
}

function networkConsistencyTurtle(addressNetwork) {
  return classATurtle({
    txPredicates: [
      "cardano:networkId 1",
      "cardano:hasOutput _:output1",
      "cardano:hasWithdrawal _:withdrawal1",
      "cardano:hasProposal _:proposal1",
    ],
    body: `
_:output1 a cardano:Output ;
  cardano:hasIndex 0 ;
  cardano:lovelace 1000000 ;
  cardano:atAddress <urn:cardano:address:network-consistency-output> .
<urn:cardano:address:network-consistency-output> a cardano:Address ;
  cardano:network ${addressNetwork} .
_:withdrawal1 a cardano:Withdrawal ;
  cardano:network 1 ;
  cardano:hasLovelace 1 .
_:proposal1 a cardano:Proposal ;
  cardano:network 1 ;
  cardano:hasGovAction _:networkConsistencyAction1 .
_:networkConsistencyAction1 a cardano:NoConfidence .
`,
  });
}

function mixedNetworkTurtle() {
  return classATurtle({
    txPredicates: [
      "cardano:hasOutput _:output1",
      "cardano:hasWithdrawal _:withdrawal1",
    ],
    body: `
_:output1 a cardano:Output ;
  cardano:hasIndex 0 ;
  cardano:lovelace 1000000 ;
  cardano:atAddress <urn:cardano:address:mixed-network-output> .
<urn:cardano:address:mixed-network-output> a cardano:Address ;
  cardano:network 1 .
_:withdrawal1 a cardano:Withdrawal ;
  cardano:network 0 ;
  cardano:hasLovelace 1 .
`,
  });
}

const conwayBodyFields = [
  { key: 0, label: "inputs" },
  { key: 1, label: "outputs" },
  { key: 2, label: "fee" },
  { key: 3, label: "ttl" },
  { key: 4, label: "certs" },
  { key: 5, label: "withdrawals" },
  { key: 6, label: "update" },
  { key: 7, label: "auxiliary_data_hash" },
  { key: 8, label: "validity_start_interval" },
  { key: 9, label: "mint" },
  { key: 11, label: "script_data_hash" },
  { key: 13, label: "collateral" },
  { key: 14, label: "required_signers" },
  { key: 15, label: "network_id" },
  { key: 16, label: "collateral_return" },
  { key: 17, label: "total_collateral" },
  { key: 18, label: "reference_inputs" },
  { key: 19, label: "voting_procedures" },
  { key: 20, label: "voting_proposals" },
  { key: 22, label: "donation" },
  { key: 21, label: "current_treasury_value" },
];
const conwayWitnessFields = [
  { keys: [0], label: "vkeys" },
  { keys: [1], label: "native_scripts" },
  { keys: [2], label: "bootstraps" },
  { keys: [3, 6, 7], label: "plutus_scripts" },
  { keys: [4], label: "plutus_data" },
  { keys: [5], label: "redeemers" },
];
const conwayAuxiliaryDataFields = [
  "metadata",
  "native_scripts",
  "plutus_scripts",
  "prefer_alonzo_format",
];
const conwayBodyFieldByKey = new Map(
  conwayBodyFields.map((field) => [field.key, field.label]),
);
const conwayWitnessFieldByKey = new Map(
  conwayWitnessFields.flatMap((field) =>
    field.keys.map((key) => [key, field.label]),
  ),
);
class CborReader {
  constructor(hex) {
    this.bytes = Buffer.from(hex.replace(/\s+/g, ""), "hex");
    this.offset = 0;
  }

  peekByte() {
    if (this.offset >= this.bytes.length) {
      throw new Error("unexpected end of CBOR");
    }
    return this.bytes[this.offset];
  }

  readByte() {
    const byte = this.peekByte();
    this.offset += 1;
    return byte;
  }

  isBreak() {
    return this.offset < this.bytes.length && this.bytes[this.offset] === 0xff;
  }

  readLength(additional) {
    if (additional < 24) return additional;
    if (additional === 24) return this.readByte();
    if (additional === 25) {
      const value = this.bytes.readUInt16BE(this.offset);
      this.offset += 2;
      return value;
    }
    if (additional === 26) {
      const value = this.bytes.readUInt32BE(this.offset);
      this.offset += 4;
      return value;
    }
    if (additional === 27) {
      const value = this.bytes.readBigUInt64BE(this.offset);
      this.offset += 8;
      if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new Error(`CBOR length exceeds safe integer: ${value}`);
      }
      return Number(value);
    }
    if (additional === 31) return null;
    throw new Error(`unsupported CBOR additional info ${additional}`);
  }

  readHeader() {
    const initial = this.readByte();
    const major = initial >> 5;
    const additional = initial & 0x1f;
    const length = this.readLength(additional);
    return { major, additional, length, indefinite: additional === 31 };
  }

  readInteger() {
    const header = this.readHeader();
    if (header.major === 0) return header.length;
    if (header.major === 1) return -1 - header.length;
    throw new Error(`expected integer key, got CBOR major ${header.major}`);
  }

  readArrayLength() {
    const header = this.readHeader();
    if (header.major !== 4 || header.indefinite) {
      throw new Error("expected definite CBOR array");
    }
    return header.length;
  }

  readBool() {
    const header = this.readHeader();
    if (header.major !== 7) {
      throw new Error(`expected CBOR bool, got major ${header.major}`);
    }
    if (header.additional === 20) return false;
    if (header.additional === 21) return true;
    throw new Error(`expected CBOR bool, got simple ${header.additional}`);
  }

  readIntegerKeyMap() {
    const header = this.readHeader();
    if (header.major !== 5) {
      throw new Error(`expected CBOR map, got major ${header.major}`);
    }
    const keys = [];
    const readEntry = () => {
      keys.push(this.readInteger());
      this.skipValue();
    };

    if (header.indefinite) {
      while (!this.isBreak()) readEntry();
      this.readByte();
    } else {
      for (let i = 0; i < header.length; i += 1) readEntry();
    }
    return new Set(keys);
  }

  readAuxiliaryData() {
    if (this.peekByte() === 0xf6) {
      this.skipValue();
      return { present: false, metadataLabels: [] };
    }

    while ((this.peekByte() >> 5) === 6) {
      this.readHeader();
    }

    const header = this.readHeader();
    if (header.major !== 5) {
      this.skipValueAfterHeader(header);
      return { present: true, metadataLabels: [] };
    }

    const metadataLabels = [];
    let sawAuxiliaryEnvelope = false;
    const readEntry = () => {
      const key = this.readInteger();
      if (key >= 0 && key <= 3) sawAuxiliaryEnvelope = true;
      if (key === 0) {
        metadataLabels.push(...this.readMetadataLabels());
      } else {
        if (!sawAuxiliaryEnvelope) metadataLabels.push(key);
        this.skipValue();
      }
    };

    if (header.indefinite) {
      while (!this.isBreak()) readEntry();
      this.readByte();
    } else {
      for (let i = 0; i < header.length; i += 1) readEntry();
    }

    return { present: true, metadataLabels };
  }

  readMetadataLabels() {
    const header = this.readHeader();
    if (header.major !== 5) {
      this.skipValueAfterHeader(header);
      return [];
    }

    const labels = [];
    const readEntry = () => {
      labels.push(this.readInteger());
      this.skipValue();
    };
    if (header.indefinite) {
      while (!this.isBreak()) readEntry();
      this.readByte();
    } else {
      for (let i = 0; i < header.length; i += 1) readEntry();
    }
    return labels;
  }

  skipValue() {
    this.skipValueAfterHeader(this.readHeader());
  }

  skipValueAfterHeader(header) {
    switch (header.major) {
      case 0:
      case 1:
        return;
      case 2:
      case 3:
        if (header.indefinite) {
          while (!this.isBreak()) this.skipValue();
          this.readByte();
        } else {
          this.offset += header.length;
        }
        return;
      case 4:
        if (header.indefinite) {
          while (!this.isBreak()) this.skipValue();
          this.readByte();
        } else {
          for (let i = 0; i < header.length; i += 1) this.skipValue();
        }
        return;
      case 5:
        if (header.indefinite) {
          while (!this.isBreak()) {
            this.skipValue();
            this.skipValue();
          }
          this.readByte();
        } else {
          for (let i = 0; i < header.length; i += 1) {
            this.skipValue();
            this.skipValue();
          }
        }
        return;
      case 6:
        this.skipValue();
        return;
      case 7:
        if (header.additional === 24) this.offset += 1;
        else if (header.additional === 25) this.offset += 2;
        else if (header.additional === 26) this.offset += 4;
        else if (header.additional === 27) this.offset += 8;
        return;
      default:
        throw new Error(`unsupported CBOR major type ${header.major}`);
    }
  }
}

function walkConwayTransactionCbor(hex) {
  const reader = new CborReader(hex);
  const txLength = reader.readArrayLength();
  expect(txLength, "Conway transaction CBOR must be a 4-item array").toBe(4);
  const bodyKeys = reader.readIntegerKeyMap();
  const witnessKeys = reader.readIntegerKeyMap();
  const isValid = reader.readBool();
  const auxiliaryData = reader.readAuxiliaryData();

  return { bodyKeys, witnessKeys, isValid, auxiliaryData };
}

async function signedTxFixtures(root = amaruTreasuryTx2026Root) {
  const fixtures = [];
  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(entryPath);
      } else if (entry.isFile() && entry.name === "signed-tx.hex") {
        fixtures.push(entryPath);
      }
    }
  }
  await walk(root);
  return fixtures.sort();
}

async function contingencySignedTxFixture() {
  const fixtures = await signedTxFixtures();
  const fixture = fixtures.find((fixturePath) => fixturePath.includes(contingencyTxId));
  expect(
    fixture,
    `expected to find contingency signed-tx.hex fixture ${contingencyTxId}`,
  ).toBeTruthy();
  return fixture;
}

function normalizeStructureLabel(label) {
  return String(label || "")
    .replace(/\s+\d+\s+(fields?|inputs?|outputs?|key witnesses?|redeemers?|labels?)$/i, "")
    .replace(/\s+NULL$/i, "")
    .replace(/\s+(true|false)$/i, "")
    .replace(/\s+urn:cardano:.*$/i, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeSummary(summary) {
  return String(summary || "").trim();
}

const decodedPanelSelector = ".decoded-screen";
const decodedTreeContainerSelector = ".decoded-tree-container";
const decodedTreeRowSelector = ".decoded-tree-row";
const decodedTreeValueSelector =
  ":scope > .decoded-tree-main .decoded-tree-raw-value, :scope > .decoded-tree-main .decoded-tree-subject, :scope > .decoded-tree-main .decoded-tree-value, :scope > .decoded-tree-main .decoded-tree-resolved-name";

function decodedPanel(scope) {
  return scope.locator(decodedPanelSelector);
}

function decodedRowWithKey(scope, page, label, { depth } = {}) {
  const selector =
    depth === undefined
      ? decodedTreeRowSelector
      : `${decodedTreeRowSelector}.decoded-tree-depth-${depth}`;
  return scope.locator(selector, {
    has: page.locator(".decoded-tree-key", {
      hasText: label,
    }),
  });
}

async function decodedRowText(row) {
  return row.locator(decodedTreeValueSelector).first().innerText();
}

async function decodedRowRawText(row) {
  const rawValue = row.locator(":scope > .decoded-tree-main .decoded-tree-raw-value").first();
  if ((await rawValue.count()) > 0) return rawValue.innerText();
  return decodedRowText(row);
}

async function expandDecodedStructure(panel) {
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

async function decodedStructureRows(page) {
  const panel = decodedPanel(page);
  await expandDecodedStructure(panel);
  // Exclude the "Absent fields" grouping chips — they are display sugar, not decoded
  // fields; expandDecodedStructure has already expanded them so the real field rows are
  // present, and the faithful-decode assertions must see fields only.
  return panel
    .locator(".decoded-tree-row:not(.decoded-tree-empty-group)")
    .evaluateAll((nodes) => {
      const rows = nodes.map((node, index) => {
        const depthClass = Array.from(node.classList).find((className) =>
          className.startsWith("decoded-tree-depth-"),
        );
        const labelNode = node.querySelector(
          ":scope > .decoded-tree-main > .decoded-tree-line > .decoded-tree-key",
        );
        const summaryNode = node.querySelector(
          ":scope > .decoded-tree-main .decoded-tree-raw-value, :scope > .decoded-tree-main .decoded-tree-subject, :scope > .decoded-tree-main .decoded-tree-value, :scope > .decoded-tree-main .decoded-tree-resolved-name",
        );
        const depth = depthClass
          ? Number(depthClass.replace("decoded-tree-depth-", ""))
          : 0;
        const summary = summaryNode?.textContent?.trim() || "";
        return {
          index,
          depth,
          label: labelNode?.textContent?.trim() || "",
          summary: node.classList.contains("decoded-tree-empty-field") ? "NULL" : summary,
        };
      });

      return rows.map((row, index) => {
        if (row.summary !== "") return row;

        const children = [];
        for (let childIndex = index + 1; childIndex < rows.length; childIndex += 1) {
          const child = rows[childIndex];
          if (child.depth <= row.depth) break;
          if (child.depth === row.depth + 1) children.push(child);
        }

        if (children.length > 0 && children.every((child) => child.summary === "NULL")) {
          return { ...row, summary: "NULL" };
        }
        return row;
      });
    });
}

async function decodedStructureIndentationViolations(page) {
  const panel = decodedPanel(page);
  await expandDecodedStructure(panel);
  return panel.locator(decodedTreeContainerSelector).evaluate((root) => {
    const depthOf = (row) => {
      const depthClass = Array.from(row.classList).find((className) =>
        className.startsWith("decoded-tree-depth-"),
      );
      return depthClass ? Number(depthClass.replace("decoded-tree-depth-", "")) : 0;
    };
    const labelOf = (row) =>
      (
        row.querySelector(
          ":scope > .decoded-tree-main > .decoded-tree-line > .decoded-tree-key",
        )
      )?.textContent?.trim() || "(unlabelled)";
    const leftOf = (row) =>
      (
        row.querySelector(
          ":scope > .decoded-tree-main > .decoded-tree-line > .decoded-tree-key",
        ) || row
      ).getBoundingClientRect().left;
    const directChildrenOf = (row) => {
      const parentDepth = depthOf(row);
      const children = [];
      let sibling = row.nextElementSibling;
      while (sibling?.classList.contains("decoded-tree-row")) {
        const siblingDepth = depthOf(sibling);
        if (siblingDepth <= parentDepth) break;
        if (siblingDepth === parentDepth + 1) children.push(sibling);
        sibling = sibling.nextElementSibling;
      }
      return children;
    };

    const violations = [];
    for (const parent of root.querySelectorAll(".decoded-tree-row")) {
      const parentDepth = depthOf(parent);
      if (parentDepth < 3) continue;
      const parentLeft = leftOf(parent);
      for (const child of directChildrenOf(parent)) {
        const childDepth = depthOf(child);
        const childLeft = leftOf(child);
        if (!(childLeft > parentLeft)) {
          violations.push(
            `${labelOf(parent)} depth ${parentDepth} left ${parentLeft.toFixed(2)} -> ${labelOf(child)} depth ${childDepth} left ${childLeft.toFixed(2)}`,
          );
        }
      }
    }
    return violations;
  });
}

async function decodedTreeAnnotationActionLayout(row) {
  return row.evaluate((node) => ({
    headerButtonCount: node.querySelectorAll(
      ':scope > .decoded-tree-trailing .decoded-tree-annotate[data-aria-label="Label this node"]',
    ).length,
    standaloneButtonCount: node.querySelectorAll(
      ":scope > .decoded-tree-main > .decoded-tree-annotate",
    ).length,
  }));
}

async function browserRowActionLayout(row) {
  return row.evaluate((node) => ({
    headerActions: Array.from(
      node.querySelectorAll(":scope > .browser-row-main > .browser-keyline md-outlined-button"),
    ).map((button) => button.textContent.trim()),
    standaloneActionCount: node.querySelectorAll(":scope > .browser-actions").length,
  }));
}

async function directDecodedTreeChildLabels(row) {
  return row.evaluate((node) => {
    const depthOf = (row) => {
      const depthClass = Array.from(row.classList).find((className) =>
        className.startsWith("decoded-tree-depth-"),
      );
      return depthClass ? Number(depthClass.replace("decoded-tree-depth-", "")) : 0;
    };
    const labelOf = (row) =>
      row
        .querySelector(":scope > .decoded-tree-main > .decoded-tree-line > .decoded-tree-key")
        ?.textContent?.trim() || "";
    const parentDepth = depthOf(node);
    const labels = [];
    let sibling = node.nextElementSibling;
    while (sibling?.classList.contains("decoded-tree-row")) {
      const siblingDepth = depthOf(sibling);
      if (siblingDepth <= parentDepth) break;
      if (
        siblingDepth === parentDepth + 1 &&
        !sibling.classList.contains("decoded-tree-empty-group")
      ) {
        labels.push(labelOf(sibling));
      }
      sibling = sibling.nextElementSibling;
    }
    return labels;
  });
}

function rowLabel(row) {
  return normalizeStructureLabel(row.label);
}

function rowSummary(row) {
  return normalizeSummary(row.summary);
}

function rootRowIndex(rows) {
  const index = rows.findIndex((row) => row.depth === 0 && rowLabel(row) === "transaction");
  expect(index, "Structure tree should expose a transaction root").toBeGreaterThanOrEqual(0);
  return index;
}

function descendantRange(rows, parentIndex) {
  const parentDepth = rows[parentIndex].depth;
  let end = parentIndex + 1;
  while (end < rows.length && rows[end].depth > parentDepth) end += 1;
  return rows.slice(parentIndex + 1, end);
}

function childRows(rows, parentIndex) {
  const parentDepth = rows[parentIndex].depth;
  return descendantRange(rows, parentIndex).filter(
    (row) => row.depth === parentDepth + 1,
  );
}

function childLabels(rows, parentIndex) {
  return childRows(rows, parentIndex).map(rowLabel);
}

function childRow(rows, parentIndex, label) {
  return childRows(rows, parentIndex).find((row) => rowLabel(row) === label);
}

function rowIndex(rows, target) {
  const index = rows.findIndex((row) => row.index === target.index);
  expect(index, `row ${target.label} should be present`).toBeGreaterThanOrEqual(0);
  return index;
}

function expectAbsentRowsAreNull(rows, parentIndex, fields, presentLabels, context) {
  for (const child of childRows(rows, parentIndex)) {
    const label = rowLabel(child);
    if (!fields.includes(label) || presentLabels.has(label)) continue;
    expect(
      rowSummary(child),
      `${context}.${label} should render explicit NULL when absent`,
    ).toBe("NULL");
  }
}

function renderedConwayFieldTree(rows) {
  const rootIndex = rootRowIndex(rows);
  const transactionRow = childRow(rows, rootIndex, "transaction");
  expect(transactionRow, "transaction wrapper").toBeTruthy();
  const transactionIndex = rowIndex(rows, transactionRow);
  const bodyRow = childRow(rows, transactionIndex, "body");
  expect(bodyRow, "transaction body").toBeTruthy();
  const witnessRow = childRow(rows, transactionIndex, "witness_set");
  expect(witnessRow, "transaction witness_set").toBeTruthy();
  const auxiliaryRow = childRow(rows, transactionIndex, "auxiliary_data");
  expect(auxiliaryRow, "transaction auxiliary_data").toBeTruthy();

  return {
    top_level: childLabels(rows, rootIndex),
    transaction: childLabels(rows, transactionIndex),
    body: childLabels(rows, rowIndex(rows, bodyRow)),
    witness_set: childLabels(rows, rowIndex(rows, witnessRow)),
    auxiliary_data: childLabels(rows, rowIndex(rows, auxiliaryRow)),
  };
}

function expectRenderedConwayShape(rows, shape, fixtureName) {
  const rootIndex = rootRowIndex(rows);
  expect(childLabels(rows, rootIndex), `${fixtureName} top-level structure`).toEqual([
    "transaction_hash",
    "transaction",
  ]);

  const transactionRow = childRow(rows, rootIndex, "transaction");
  expect(transactionRow, `${fixtureName} transaction wrapper`).toBeTruthy();
  const transactionIndex = rowIndex(rows, transactionRow);
  expect(childLabels(rows, transactionIndex), `${fixtureName} transaction fields`).toEqual([
    "body",
    "witness_set",
    "is_valid",
    "auxiliary_data",
  ]);

  const bodyRow = childRow(rows, transactionIndex, "body");
  expect(bodyRow, `${fixtureName} body`).toBeTruthy();
  const bodyIndex = rowIndex(rows, bodyRow);
  const bodyLabels = childLabels(rows, bodyIndex);
  const expectedBodyLabels = conwayBodyFields.map((field) => field.label);
  expect(bodyLabels, `${fixtureName} body CDDL order`).toEqual(expectedBodyLabels);
  for (const key of shape.bodyKeys) {
    const field = conwayBodyFieldByKey.get(key);
    expect(field, `${fixtureName} unsupported body key ${key}`).toBeTruthy();
    expect(bodyLabels, `${fixtureName} present body key ${key}`).toContain(field);
  }
  expectAbsentRowsAreNull(
    rows,
    bodyIndex,
    expectedBodyLabels,
    new Set(
      Array.from(shape.bodyKeys)
        .map((key) => conwayBodyFieldByKey.get(key))
        .filter(Boolean),
    ),
    `${fixtureName}.body`,
  );

  const witnessRow = childRow(rows, transactionIndex, "witness_set");
  expect(witnessRow, `${fixtureName} witness_set`).toBeTruthy();
  const witnessIndex = rowIndex(rows, witnessRow);
  const witnessLabels = childLabels(rows, witnessIndex);
  const expectedWitnessLabels = conwayWitnessFields.map((field) => field.label);
  expect(witnessLabels, `${fixtureName} witness_set CDDL order`).toEqual(
    expectedWitnessLabels,
  );
  for (const key of shape.witnessKeys) {
    const field = conwayWitnessFieldByKey.get(key);
    expect(field, `${fixtureName} unsupported witness_set key ${key}`).toBeTruthy();
    expect(witnessLabels, `${fixtureName} present witness_set key ${key}`).toContain(field);
  }
  expectAbsentRowsAreNull(
    rows,
    witnessIndex,
    expectedWitnessLabels,
    new Set(
      Array.from(shape.witnessKeys)
        .map((key) => conwayWitnessFieldByKey.get(key))
        .filter(Boolean),
    ),
    `${fixtureName}.witness_set`,
  );

  const isValidRow = childRow(rows, transactionIndex, "is_valid");
  expect(isValidRow, `${fixtureName} is_valid`).toBeTruthy();
  expect(rowSummary(isValidRow), `${fixtureName} is_valid value`).toBe(
    String(shape.isValid),
  );

  const auxiliaryRow = childRow(rows, transactionIndex, "auxiliary_data");
  expect(auxiliaryRow, `${fixtureName} auxiliary_data`).toBeTruthy();
  if (!shape.auxiliaryData.present) {
    expect(rowSummary(auxiliaryRow), `${fixtureName} auxiliary_data absent`).toBe("NULL");
  } else {
    const auxiliaryIndex = rowIndex(rows, auxiliaryRow);
    expect(
      childLabels(rows, auxiliaryIndex),
      `${fixtureName} auxiliary_data fields`,
    ).toEqual(conwayAuxiliaryDataFields);
    if (shape.auxiliaryData.metadataLabels.length > 0) {
      const metadataRow = childRow(rows, auxiliaryIndex, "metadata");
      expect(metadataRow, `${fixtureName} auxiliary_data.metadata`).toBeTruthy();
      const metadataLabels = descendantRange(rows, rowIndex(rows, metadataRow)).map(rowLabel);
      expect(
        metadataLabels,
        `${fixtureName} auxiliary_data.metadata expansion`,
      ).toContain("metadata_label");
      expect(
        metadataLabels.some((label) => ["text", "raw_bytes"].includes(label)),
        `${fixtureName} auxiliary_data.metadata value expansion`,
      ).toBeTruthy();
    }
  }

  const feeRows = rows.filter((row) => rowLabel(row) === "fee");
  expect(feeRows, `${fixtureName} duplicate fee rows`).toHaveLength(1);
}

function contentTypeFor(filePath) {
  if (filePath.endsWith(".html")) return "text/html";
  if (filePath.endsWith(".js")) return "text/javascript";
  if (filePath.endsWith(".css")) return "text/css";
  if (filePath.endsWith(".wasm")) return "application/wasm";
  return "application/octet-stream";
}

async function withPrefixedInspectorSite(callback) {
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", "http://127.0.0.1");
      if (!url.pathname.startsWith(previewPrefix)) {
        response.writeHead(404).end("outside preview prefix");
        return;
      }

      let relativePath = decodeURIComponent(url.pathname.slice(previewPrefix.length));
      if (relativePath === "" || relativePath.endsWith("/")) {
        relativePath += "index.html";
      } else if (["inspect", "settings", "library"].includes(relativePath)) {
        relativePath += "/index.html";
      }

      const targetPath = path.normalize(path.join(packagedSiteDir, relativePath));
      if (!targetPath.startsWith(packagedSiteDir + path.sep)) {
        response.writeHead(403).end("outside site root");
        return;
      }

      const body = await readFile(targetPath);
      response.writeHead(200, { "content-type": contentTypeFor(targetPath) });
      response.end(body);
    } catch {
      response.writeHead(404).end("not found");
    }
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    await callback(`http://127.0.0.1:${port}${previewPrefix}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function loadValidationContext() {
  const request = JSON.parse(await readFile(validationFixturePath, "utf8"));
  return request.args.context;
}

function producerCbor(context, txHash, fallback) {
  return context.producer_txs?.[txHash]?.tx_cbor || fallback;
}

async function mockKoiosValidationContext(page, validationContext) {
  await page.route("https://api.koios.rest/api/v1/tip", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          abs_slot: Number(validationContext.slot),
          epoch_no: Number(validationContext.epoch),
        },
      ]),
    });
  });
  await page.route("https://api.koios.rest/api/v1/cli_protocol_params", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(validationContext.protocol_parameters),
    });
  });
}

function blockfrostParamsFromLedger(params) {
  const pool = params.poolVotingThresholds || {};
  const drep = params.dRepVotingThresholds || {};
  return {
    min_fee_a: params.txFeePerByte,
    min_fee_b: params.txFeeFixed,
    max_block_size: params.maxBlockBodySize,
    max_tx_size: params.maxTxSize,
    max_block_header_size: params.maxBlockHeaderSize,
    key_deposit: String(params.stakeAddressDeposit),
    pool_deposit: String(params.stakePoolDeposit),
    e_max: params.poolRetireMaxEpoch,
    n_opt: params.stakePoolTargetNum,
    a0: params.poolPledgeInfluence,
    rho: params.monetaryExpansion,
    tau: params.treasuryCut,
    protocol_major_ver: params.protocolVersion?.major,
    protocol_minor_ver: params.protocolVersion?.minor,
    min_pool_cost: String(params.minPoolCost),
    coins_per_utxo_size: String(params.utxoCostPerByte),
    cost_models_raw: params.costModels,
    price_mem: params.executionUnitPrices?.priceMemory,
    price_step: params.executionUnitPrices?.priceSteps,
    max_tx_ex_mem: String(params.maxTxExecutionUnits?.memory),
    max_tx_ex_steps: String(params.maxTxExecutionUnits?.steps),
    max_block_ex_mem: String(params.maxBlockExecutionUnits?.memory),
    max_block_ex_steps: String(params.maxBlockExecutionUnits?.steps),
    max_val_size: String(params.maxValueSize),
    collateral_percent: params.collateralPercentage,
    max_collateral_inputs: params.maxCollateralInputs,
    pvt_motion_no_confidence: pool.motionNoConfidence,
    pvt_committee_normal: pool.committeeNormal,
    pvt_committee_no_confidence: pool.committeeNoConfidence,
    pvt_hard_fork_initiation: pool.hardForkInitiation,
    pvt_p_p_security_group: pool.ppSecurityGroup,
    dvt_motion_no_confidence: drep.motionNoConfidence,
    dvt_committee_normal: drep.committeeNormal,
    dvt_committee_no_confidence: drep.committeeNoConfidence,
    dvt_update_to_constitution: drep.updateToConstitution,
    dvt_hard_fork_initiation: drep.hardForkInitiation,
    dvt_p_p_network_group: drep.ppNetworkGroup,
    dvt_p_p_economic_group: drep.ppEconomicGroup,
    dvt_p_p_technical_group: drep.ppTechnicalGroup,
    dvt_p_p_gov_group: drep.ppGovGroup,
    dvt_treasury_withdrawal: drep.treasuryWithdrawal,
    committee_min_size: String(params.committeeMinSize),
    committee_max_term_length: String(params.committeeMaxTermLength),
    gov_action_lifetime: String(params.govActionLifetime),
    gov_action_deposit: String(params.govActionDeposit),
    drep_deposit: String(params.dRepDeposit),
    drep_activity: String(params.dRepActivity),
    min_fee_ref_script_cost_per_byte: params.minFeeRefScriptCostPerByte,
  };
}

async function decodeFixtureAt(page, route, txFixturePath = fixturePath) {
  const txCbor = (await readFile(txFixturePath, "utf8")).trim();
  const validationContext = await loadValidationContext();

  await installClipboardMock(page);
  await mockKoiosValidationContext(page, validationContext);

  await decodeTxCbor(page, route, txCbor);
}

async function decodeTxCbor(page, route, txCbor) {
  await page.goto(route);
  await submitTxCbor(page, txCbor);
}

async function submitTxCbor(page, txCbor) {
  const cborMode = page.getByRole("tab", { name: "Paste CBOR" });
  if ((await cborMode.count()) === 0) {
    await page.getByRole("button", { name: "Change input" }).click();
  }
  await cborMode.click();
  await page.getByPlaceholder("Paste Conway transaction CBOR hex").fill(txCbor);
  await page.getByRole("button", { name: "Decode" }).click();

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

async function decodeFixture(page, txFixturePath = fixturePath) {
  await decodeFixtureAt(page, "/", txFixturePath);
}

async function expectTabbedInspectResult(page) {
  const resultPanel = page.locator(".result-panel");
  await expect(resultPanel).toBeVisible();

  const tabs = resultPanel.getByRole("tablist", { name: "Inspect result views" });
  await expect(tabs).toBeVisible();

  const structureTab = tabs.getByRole("tab", { name: "Structure" });
  await expect(structureTab).toHaveAttribute("aria-selected", "true");

  const structurePanel = resultPanel.getByRole("tabpanel", { name: "Structure" });
  await expect(structurePanel).toBeVisible();
  await expect(
    structurePanel.getByRole("heading", { name: "Decoded transaction" }),
  ).toBeVisible();
  await expect(
    structurePanel
      .locator(".decoded-tree-row.decoded-tree-depth-0", { hasText: "Transaction" })
      .first(),
  ).toBeVisible();

  await tabs.getByRole("tab", { name: "Witness" }).click();
  const witnessPanel = resultPanel.getByRole("tabpanel", { name: "Witness" });
  await expect(witnessPanel.getByRole("heading", { name: /Intent|Witness plan/ })).toBeVisible();
  await expect(witnessPanel.getByRole("heading", { name: "Witness plan" })).toBeVisible();

  await tabs.getByRole("tab", { name: "Validation" }).click();
  const validationPanel = resultPanel.getByRole("tabpanel", { name: "Validation" });
  await expect(validationPanel.locator(".validation-panel")).toBeVisible();
  await expect(validationPanel.locator(".validation-verdict-banner")).toBeVisible();
  await expect(validationPanel.locator(".validation-filter-chips")).toBeVisible();
  await expect(validationPanel.locator(".validation-check-row").first()).toBeVisible();
  await expect(
    validationPanel.getByRole("heading", { name: "RDF SHACL conformance" }),
  ).toBeVisible();

  await tabs.getByRole("tab", { name: "Graph / RDF" }).click();
  const graphPanel = resultPanel.getByRole("tabpanel", { name: "Graph / RDF" });
  await expect(
    graphPanel.getByRole("heading", { name: "Transaction RDF graph" }),
  ).toBeVisible();
  await expect(graphPanel.getByRole("heading", { name: "Selected books" })).toBeVisible();
  await expect(
    graphPanel.getByRole("heading", { name: "SPARQL lens: resolved labels" }),
  ).toBeVisible();
  await expect(
    graphPanel.getByRole("heading", { name: "SPARQL lens: typed contract fields" }),
  ).toBeVisible();
  await expect(
    graphPanel.getByRole("heading", { name: "SPARQL lens: transaction outputs" }),
  ).toBeVisible();
  await expect(
    graphPanel.getByRole("heading", { name: "Transaction browser" }),
  ).toBeVisible();
  await expect(graphPanel.getByText("Raw JSON", { exact: true })).toBeVisible();
}

async function expectCQuisitorInspectSurface(page, route, testInfo, captureEvidence = false) {
  const viewports = [
    { width: 1024, height: 768 },
    { width: 390, height: 844 },
  ];

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await decodeFixtureAt(page, route, conwayMainnetFixturePath);

    const topbar = page.getByRole("banner");
    await expect(topbar.getByText("Ledger Inspector", { exact: true })).toBeVisible();
    await expect(topbar.getByRole("navigation").getByRole("link", { name: "Workbench" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    const workspace = page.locator(".workspace");
    const loadedHeader = page.locator(".loaded-inspector-header");
    const booksPanel = workspace.locator(".books-panel");
    const resultPanel = workspace.locator(".result-panel");
    await expect(loadedHeader).toBeVisible();
    await expect(loadedHeader).toContainText("CBOR hex");
    await expect(loadedHeader).toContainText(/Blockfrost|Koios/);
    await expect(loadedHeader).toContainText("mainnet");
    await expect(loadedHeader).toContainText(/Tx (id|hash)/i);
    await expect(loadedHeader).toContainText(/[0-9a-f]{16}/i);
    await expect(loadedHeader.getByRole("button", { name: "Change input" })).toBeVisible();
    await expect(loadedHeader.getByRole("link", { name: "Library" })).toBeVisible();
    await expect(loadedHeader.getByRole("button", { name: "Apply selected books" })).toBeVisible();
    await expect(loadedHeader).toContainText(/selected|parts/);

    await expect(page.locator(".workspace-left")).toHaveCount(0);
    await expect(page.locator(".workspace-right")).toHaveCount(0);
    await expect(booksPanel).toHaveCount(0);
    await expect(page.locator(".resolution-books-panel")).toHaveCount(0);
    const tabs = resultPanel.getByRole("tablist", { name: "Inspect result views" });
    await expect(tabs.getByRole("tab", { name: "Structure" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    const decodedTreePanel = decodedPanel(resultPanel);
    await expect(decodedTreePanel).toBeVisible();
    const decodedHeading = decodedTreePanel.getByRole("heading", { name: "Decoded transaction" });
    await expect(decodedHeading).toBeVisible();
    const transactionRow = decodedTreePanel.locator(".decoded-tree-row", {
      hasText: "Transaction",
    }).first();
    await expect(transactionRow).toBeVisible();
    await expect(resultPanel.getByRole("heading", { name: "Conway transaction identity" })).toHaveCount(0);
    await expect(resultPanel.locator(".summary-identity-grid")).toHaveCount(0);

    const loadedStack = await workspace.evaluate((root) => {
      const rectForElement = (element) => {
        const rect = element.getBoundingClientRect();
        return {
          top: rect.top,
          bottom: rect.bottom,
          left: rect.left,
          width: rect.width,
        };
      };
      const rectFor = (selector) => {
        const element = root.querySelector(selector);
        return element ? rectForElement(element) : null;
      };
      return {
        workspace: rectForElement(root),
        header: rectFor(".loaded-inspector-header"),
        result: rectFor(".result-panel"),
      };
    });
    expect(loadedStack.workspace).not.toBeNull();
    expect(loadedStack.header).not.toBeNull();
    expect(loadedStack.result).not.toBeNull();
    expect(loadedStack.header.bottom).toBeLessThanOrEqual(loadedStack.result.top + 1);
    expect(loadedStack.result.width).toBeGreaterThan(loadedStack.workspace.width * 0.92);
    expect(Math.abs(loadedStack.header.left - loadedStack.result.left)).toBeLessThanOrEqual(4);

    const firstViewport = await resultPanel.evaluate((panel) => {
      const tabBar = panel.querySelector(".result-tab-bar");
      const decodedHeading = Array.from(panel.querySelectorAll("h1, h2, h3")).find(
        (heading) => heading.textContent?.trim() === "Decoded transaction",
      );
      return {
        tabsBottom: tabBar?.getBoundingClientRect().bottom ?? null,
        headingBottom: decodedHeading?.getBoundingClientRect().bottom ?? null,
        viewportHeight: window.innerHeight,
      };
    });
    expect(firstViewport.tabsBottom).not.toBeNull();
    expect(firstViewport.headingBottom).not.toBeNull();
    expect(firstViewport.tabsBottom).toBeLessThanOrEqual(firstViewport.viewportHeight);
    expect(firstViewport.headingBottom).toBeLessThanOrEqual(firstViewport.viewportHeight);

    if (captureEvidence) {
      const screenshotPath = testInfo.outputPath(
        `cquisitor-loaded-${viewport.width}x${viewport.height}.png`,
      );
      await page.screenshot({
        path: screenshotPath,
      });
      await testInfo.attach(`loaded hierarchy ${viewport.width}x${viewport.height}`, {
        path: screenshotPath,
        contentType: "image/png",
      });
    }
  }

  const loadedHeader = page.locator(".loaded-inspector-header");
  const resultPanel = page.locator(".result-panel");
  await loadedHeader.getByRole("button", { name: "Apply selected books" }).click();
  await expect(decodedPanel(resultPanel)).toBeVisible();
  await loadedHeader.getByRole("button", { name: "Change input" }).click();
  await expect(page.getByPlaceholder("Paste Conway transaction CBOR hex")).toBeVisible();
  await page.getByRole("button", { name: "Decode" }).click();
  await expect(loadedHeader).toBeVisible();
  await loadedHeader.getByRole("link", { name: "Library" }).click();
  await expect(page).toHaveURL(/\/library\/?$/);
}

async function selectResultTab(page, name) {
  const resultPanel = page.locator(".result-panel");
  await resultPanel.getByRole("tab", { name }).click();
  const panel = resultPanel.getByRole("tabpanel", { name });
  await expect(panel).toBeVisible();
  return panel;
}

async function expectDocumentNoHorizontalOverflow(page, label) {
  const overflowPx = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflowPx, label).toBeLessThanOrEqual(1);
}

async function expectResultTabBarRightEdgeFlush(page, label) {
  const metrics = await page.locator(".result-panel").evaluate((panel) => {
    const tabBar = panel.querySelector(".result-tab-bar");
    if (!tabBar) return null;
    const panelRect = panel.getBoundingClientRect();
    const tabBarRect = tabBar.getBoundingClientRect();
    return {
      panelRight: panelRect.right,
      tabBarRight: tabBarRect.right,
    };
  });

  expect(metrics, label).not.toBeNull();
  expect(
    Math.abs(metrics.tabBarRight - metrics.panelRight),
    label,
  ).toBeLessThanOrEqual(1);
}

async function configureChainData(page, options = {}) {
  const {
    provider = "Blockfrost",
    network = "mainnet",
    blockfrostKey = "mainnet-test-project",
    koiosBearer = "koios-test-token",
  } = options;

  await page.goto("/settings");
  await page.getByRole("radio", { name: provider }).check();
  await page.getByRole("radio", { name: network }).check();
  if (provider === "Blockfrost") {
    await page
      .getByPlaceholder("mainnet... / preprod... / preview...")
      .fill(blockfrostKey);
  } else {
    await page.getByPlaceholder("eyJhbGciOi...").fill(koiosBearer);
  }
}

async function openInspectViaShell(page) {
  await page.getByRole("banner").getByRole("link", { name: "Workbench" }).click();
  await expect(page).toHaveURL(/\/inspect$/);
}

async function expectInFirstViewport(locator) {
  await expect(locator).toBeVisible();
  const box = await locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      top: rect.top,
      bottom: rect.bottom,
      innerHeight: window.innerHeight,
    };
  });

  expect(box.top).toBeGreaterThanOrEqual(0);
  expect(box.bottom).toBeLessThanOrEqual(box.innerHeight);
}

async function expectColorToken(page, locator, property, tokenName) {
  const values = await locator.evaluate(
    (element, { property, tokenName }) => {
      const probe = document.createElement("span");
      probe.style.color = `var(${tokenName})`;
      document.body.append(probe);
      const tokenValue = getComputedStyle(probe).color;
      probe.remove();

      return {
        actual: getComputedStyle(element)[property],
        tokenValue,
      };
    },
    { property, tokenName },
  );

  expect(values.actual).toBe(values.tokenValue);
}

async function installClipboardMock(page) {
  await page.addInitScript(() => {
    let copied = "";
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        readText: async () => copied,
        writeText: async (value) => {
          copied = String(value);
        },
      },
    });
  });
}

async function storedBooks(page) {
  const rawStore = await page.evaluate(
    (key) => window.localStorage.getItem(key),
    localBookStoreKey,
  );
  expect(rawStore).not.toBeNull();
  return JSON.parse(rawStore);
}

async function replaceCodeMirrorText(page, scope, text) {
  const editor = scope.locator(".cm-content").first();
  await expect(editor).toBeVisible();
  await editor.click();
  await editor.press("Control+A");
  await page.keyboard.insertText(text);
}

test("local book store seeds parsed bundled books into localStorage", async ({
  page,
}) => {
  await page.goto("/library");

  const rawStore = await page.evaluate(
    (key) => window.localStorage.getItem(key),
    localBookStoreKey,
  );
  expect(rawStore).not.toBeNull();

  const store = JSON.parse(rawStore);
  expect(store.kind).toBe(localBookStoreKey);
  expect(store.books).toHaveLength(3);
  expect(store.books.map((book) => book.name)).toEqual([
    "Amaru treasury 2026 overlay",
    "SundaeSwap V3 blueprint",
    "Cardano RDF SHACL shapes",
  ]);

  for (const book of store.books) {
    expect(book.id).toMatch(/^seed:/);
    expect(book.raw).not.toHaveLength(0);
    expect(book.source).not.toHaveLength(0);
    expect(book.seed).toBe(true);
    expect(book.selected).toBe(true);
    expect(book.parts.length).toBeGreaterThan(0);
  }

  expect(store.books[0].parts.length).toBeGreaterThan(1);
  expect(store.books[0].turtle).toContain("overlay:Treasury");
  expect(store.books[1].parts[0]).toMatchObject({
    id: "sundaeswap-v3",
    kind: "blueprint",
    label: "SundaeSwap V3 blueprint",
  });
  expect(store.books[2].parts[0]).toMatchObject({
    id: "cardano-rdf-shacl-shapes",
    kind: "shacl",
    label: "Cardano transaction SHACL shapes",
  });
  expect(store.books[2].turtle).toContain("sh:NodeShape");
});

test("library page manages local books with persisted CRUD", async ({ page }) => {
  await page.goto("/library");

  await expect(page.getByText("Library placeholder", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();

  const library = page.locator(".library-page");
  await expect(
    library.getByRole("heading", { name: "Amaru treasury 2026 overlay" }),
  ).toBeVisible();
  await expect(
    library.getByRole("heading", { name: "SundaeSwap V3 blueprint" }),
  ).toBeVisible();
  await expect(
    library.getByRole("heading", { name: "Cardano RDF SHACL shapes" }),
  ).toBeVisible();

  await library.getByLabel("Book Turtle").fill(pastedTurtleBook);
  await library.getByRole("button", { name: "Add book" }).click();
  await expect(
    library.getByText("Imported Pasted overlay Turtle (1 part).", { exact: true }),
  ).toBeVisible();
  await expect(
    library.getByRole("heading", { name: "Pasted overlay Turtle" }),
  ).toBeVisible();

  const localBook = library.locator(".library-book", { hasText: "Pasted overlay Turtle" });
  await localBook.getByRole("checkbox", { name: "Select Pasted overlay Turtle" }).uncheck();
  await localBook.getByLabel("Rename Pasted overlay Turtle").fill("Renamed local treasury label");
  await localBook.getByRole("button", { name: "Save name for Pasted overlay Turtle" }).click();
  await expect(
    library.getByRole("heading", { name: "Renamed local treasury label" }),
  ).toBeVisible();

  await page.reload();
  const renamedBook = page.locator(".library-book", { hasText: "Renamed local treasury label" });
  await expect(renamedBook).toBeVisible();
  await expect(
    renamedBook.getByRole("checkbox", { name: "Select Renamed local treasury label" }),
  ).not.toBeChecked();

  page.once("dialog", async (dialog) => {
    expect(dialog.type()).toBe("confirm");
    expect(dialog.message()).toContain("Renamed local treasury label");
    await dialog.accept();
  });
  await renamedBook.getByRole("button", { name: "Delete Renamed local treasury label" }).click();
  await expect(
    page.getByRole("heading", { name: "Renamed local treasury label" }),
  ).toHaveCount(0);

  const rawStore = await page.evaluate(
    (key) => window.localStorage.getItem(key),
    localBookStoreKey,
  );
  const store = JSON.parse(rawStore);
  expect(store.books.map((book) => book.name)).not.toContain("Renamed local treasury label");
  expect(store.books).toHaveLength(3);
});

test("library editor saves validated drafts and rejects invalid source without mutating storage", async ({
  page,
}) => {
  await installClipboardMock(page);
  await page.goto("/library");

  const library = page.locator(".library-page");
  const seedBook = library.locator(".library-book", {
    hasText: "Amaru treasury 2026 overlay",
  });
  await expect(seedBook.locator(".cm-content").first()).toBeVisible();

  await library.getByLabel("Book Turtle").fill(pastedTurtleBook);
  await library.getByRole("button", { name: "Add book" }).click();
  const localBook = library.locator(".library-book", { hasText: "Pasted overlay Turtle" });
  await expect(localBook.locator(".cm-content").first()).toBeVisible();

  const beforeEditRawStore = await page.evaluate(
    (key) => window.localStorage.getItem(key),
    localBookStoreKey,
  );
  const beforeEditStore = JSON.parse(beforeEditRawStore);
  const beforeEditBook = beforeEditStore.books.find(
    (book) => book.name === "Pasted overlay Turtle",
  );
  expect(beforeEditBook).toBeTruthy();

  const updatedTurtleBook = pastedTurtleBook.replace(
    "Local treasury label",
    "Edited treasury label",
  );
  await replaceCodeMirrorText(page, localBook, updatedTurtleBook);

  const unsavedRawStore = await page.evaluate(
    (key) => window.localStorage.getItem(key),
    localBookStoreKey,
  );
  expect(unsavedRawStore).toBe(beforeEditRawStore);

  await localBook
    .getByRole("button", { name: "Copy Pasted overlay Turtle source" })
    .click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe(updatedTurtleBook);

  await localBook
    .getByRole("button", { name: "Save Pasted overlay Turtle source" })
    .click();
  await expect(
    localBook.getByText("Saved Pasted overlay Turtle source", { exact: true }),
  ).toBeVisible();

  const savedStore = await storedBooks(page);
  const savedBook = savedStore.books.find(
    (book) => book.id === beforeEditBook.id,
  );
  expect(savedBook).toMatchObject({
    id: beforeEditBook.id,
    name: beforeEditBook.name,
    selected: beforeEditBook.selected,
    seed: beforeEditBook.seed,
  });
  expect(savedBook.raw).toBe(updatedTurtleBook);
  expect(savedBook.source).toBe("paste");
  expect(savedBook.turtle).toContain("Edited treasury label");
  expect(savedBook.parts.length).toBeGreaterThan(0);

  const savedRawStore = await page.evaluate(
    (key) => window.localStorage.getItem(key),
    localBookStoreKey,
  );
  await replaceCodeMirrorText(page, localBook, "{ invalid json");
  await localBook
    .getByRole("button", { name: "Save Pasted overlay Turtle source" })
    .click();
  await expect(
    library.getByText(/Book save failed: Save failed for Pasted overlay Turtle:/),
  ).toBeVisible();

  const afterRejectedRawStore = await page.evaluate(
    (key) => window.localStorage.getItem(key),
    localBookStoreKey,
  );
  expect(afterRejectedRawStore).toBe(savedRawStore);
});

test("library page allocates unique local ids after deleting seed books", async ({
  page,
}) => {
  await page.goto("/library");

  const library = page.locator(".library-page");
  await expect(
    library.getByRole("heading", { name: "Amaru treasury 2026 overlay" }),
  ).toBeVisible();

  await library.getByLabel("Book Turtle").fill(pastedTurtleBook);
  await library.getByRole("button", { name: "Add book" }).click();

  const firstBook = library.locator(".library-book", { hasText: "Pasted overlay Turtle" });
  await firstBook.getByLabel("Rename Pasted overlay Turtle").fill("First local book");
  await firstBook.getByRole("button", { name: "Save name for Pasted overlay Turtle" }).click();
  await expect(library.getByRole("heading", { name: "First local book" })).toBeVisible();

  page.once("dialog", async (dialog) => {
    expect(dialog.type()).toBe("confirm");
    expect(dialog.message()).toContain("Cardano RDF SHACL shapes");
    await dialog.accept();
  });
  const seedBook = library.locator(".library-book", { hasText: "Cardano RDF SHACL shapes" });
  await seedBook.getByRole("button", { name: "Delete Cardano RDF SHACL shapes" }).click();
  await expect(
    library.getByRole("heading", { name: "Cardano RDF SHACL shapes" }),
  ).toHaveCount(0);

  await library.getByLabel("Book Turtle").fill(pastedTurtleBook);
  await library.getByRole("button", { name: "Add book" }).click();
  const secondBook = library.locator(".library-book", { hasText: "Pasted overlay Turtle" });
  await secondBook.getByRole("checkbox", { name: "Select Pasted overlay Turtle" }).uncheck();

  const rawStore = await page.evaluate(
    (key) => window.localStorage.getItem(key),
    localBookStoreKey,
  );
  const store = JSON.parse(rawStore);
  const ids = store.books.map((book) => book.id);
  expect(new Set(ids).size).toBe(ids.length);

  const localBooks = store.books.filter((book) => book.source === "paste");
  expect(localBooks).toHaveLength(2);
  expect(localBooks.map((book) => book.name)).toEqual([
    "First local book",
    "Pasted overlay Turtle",
  ]);
  expect(localBooks.filter((book) => !book.selected).map((book) => book.name)).toEqual([
    "Pasted overlay Turtle",
  ]);
});

test("library page exchanges local books through URL, file, and store JSON", async ({
  page,
}) => {
  await page.route("https://books.example.test/local-shapes.ttl", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/turtle",
      body: violatingShaclShapes,
    });
  });

  await page.goto("/library");

  const library = page.locator(".library-page");
  await library.getByLabel("Book URL").fill("https://books.example.test/local-shapes.ttl");
  await library.getByRole("button", { name: "Import book from URL" }).click();
  await expect(
    library.getByText("Imported Pasted SHACL shapes (1 part).", { exact: true }),
  ).toBeVisible();
  await expect(
    library.getByRole("heading", { name: "Pasted SHACL shapes" }),
  ).toBeVisible();

  await library.getByLabel("Book file").setInputFiles({
    name: "local-book.ttl",
    mimeType: "text/turtle",
    buffer: Buffer.from(pastedTurtleBook),
  });
  await expect(
    library.getByText("Imported Pasted overlay Turtle (1 part).", { exact: true }),
  ).toBeVisible();
  await expect(
    library.getByRole("heading", { name: "Pasted overlay Turtle" }),
  ).toBeVisible();

  const fileBook = library.locator(".library-book", { hasText: "Pasted overlay Turtle" });
  await fileBook
    .getByLabel("Rename Pasted overlay Turtle")
    .fill("Round-trip local treasury label");
  await fileBook
    .getByRole("button", { name: "Save name for Pasted overlay Turtle" })
    .click();
  await expect(
    library.getByRole("heading", { name: "Round-trip local treasury label" }),
  ).toBeVisible();

  for (const name of [
    "Amaru treasury 2026 overlay",
    "SundaeSwap V3 blueprint",
    "Cardano RDF SHACL shapes",
    "Pasted SHACL shapes",
  ]) {
    await library
      .locator(".library-book", { hasText: name })
      .getByRole("checkbox", { name: `Select ${name}` })
      .uncheck();
  }

  const [selectedDownload] = await Promise.all([
    page.waitForEvent("download"),
    library.getByRole("button", { name: "Export selected books" }).click(),
  ]);
  const selectedPath = await selectedDownload.path();
  expect(selectedPath).not.toBeNull();
  const selectedJson = await readFile(selectedPath, "utf8");
  const selectedStore = JSON.parse(selectedJson);
  expect(selectedStore.kind).toBe(localBookStoreKey);
  expect(selectedStore.books.map((book) => book.name)).toEqual([
    "Round-trip local treasury label",
  ]);
  expect(selectedStore.books[0].selected).toBe(true);

  const [allDownload] = await Promise.all([
    page.waitForEvent("download"),
    library.getByRole("button", { name: "Export all books" }).click(),
  ]);
  const allPath = await allDownload.path();
  expect(allPath).not.toBeNull();
  const allStore = JSON.parse(await readFile(allPath, "utf8"));
  expect(allStore.kind).toBe(localBookStoreKey);
  expect(allStore.books.map((book) => book.name)).toEqual([
    "Amaru treasury 2026 overlay",
    "SundaeSwap V3 blueprint",
    "Cardano RDF SHACL shapes",
    "Pasted SHACL shapes",
    "Round-trip local treasury label",
  ]);

  const browser = page.context().browser();
  expect(browser).not.toBeNull();
  const cleanContext = await browser.newContext();
  try {
    const cleanPage = await cleanContext.newPage();
    await cleanPage.goto("/library");

    const cleanLibrary = cleanPage.locator(".library-page");
    await expect(
      cleanLibrary.getByRole("heading", { name: "Amaru treasury 2026 overlay" }),
    ).toBeVisible();

    await cleanLibrary.getByLabel("Book store JSON file").setInputFiles({
      name: "selected-books.json",
      mimeType: "application/json",
      buffer: Buffer.from(selectedJson),
    });
    await expect(
      cleanLibrary.getByText("Imported 1 book (1 part).", { exact: true }),
    ).toBeVisible();

    const importedBook = cleanLibrary.locator(".library-book", {
      hasText: "Round-trip local treasury label",
    });
    await expect(importedBook).toBeVisible();
    await expect(
      importedBook.getByRole("checkbox", {
        name: "Select Round-trip local treasury label",
      }),
    ).toBeChecked();

    const cleanRawStore = await cleanPage.evaluate(
      (key) => window.localStorage.getItem(key),
      localBookStoreKey,
    );
    const cleanStore = JSON.parse(cleanRawStore);
    const cleanIds = cleanStore.books.map((book) => book.id);
    expect(cleanStore.kind).toBe(localBookStoreKey);
    expect(cleanStore.books.map((book) => book.name)).toContain(
      "Round-trip local treasury label",
    );
    expect(new Set(cleanIds).size).toBe(cleanIds.length);
    expect(
      cleanStore.books.find((book) => book.name === "Round-trip local treasury label")
        ?.selected,
    ).toBe(true);
  } finally {
    await cleanContext.close();
  }
});

test("canonical wallets bundle imports selected resolution parts and reports ignored keys", async ({
  page,
}) => {
  await page.goto("/library");
  const library = page.locator(".library-page");
  const bundle = {
    kind: "amaru.book.bundle.v1",
    books: {
      wallets: [
        {
          name: "Canonical owner",
          address: "ABCDEF09D227956AAF9670751E0AA2057B51C1537A43F155B24FB1C1",
        },
      ],
      future_notes: ["retained by a future contract"],
    },
  };

  await library.getByLabel("Book file").setInputFiles({
    name: "canonical-wallets.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(bundle)),
  });

  await expect(
    library.getByText(
      "Imported Amaru book bundle (1 part). Ignored book keys: future_notes.",
      { exact: true },
    ),
  ).toBeVisible();
  const importedBook = library.locator(".library-book", {
    hasText: "Amaru book bundle",
  });
  await expect(importedBook).toBeVisible();
  await expect(
    importedBook.getByRole("checkbox", { name: "Select Amaru book bundle" }),
  ).toBeChecked();

  const store = await storedBooks(page);
  const imported = store.books.find((book) => book.name === "Amaru book bundle");
  expect(imported).toMatchObject({
    source: "amaru.book.bundle.v1",
    selected: true,
    seed: false,
  });
  expect(imported.parts).toHaveLength(1);
  expect(imported.turtle).toContain(
    "<urn:cardano:id:key:abcdef09d227956aaf9670751e0aa2057b51c1537a43f155b24fb1c1>",
  );
  expect(imported.turtle).toContain("a overlay:Owner");
  expect(imported.turtle).toContain('rdfs:label "Canonical owner"');

  await library.getByLabel("Book URL").fill("https://books.example.test/next.json");
  await expect(library.getByText(/Imported Amaru book bundle/)).toHaveCount(0);
});

test("malformed and ambiguous bundles fail visibly without mutating the store", async ({
  page,
}) => {
  await page.goto("/library");
  const library = page.locator(".library-page");
  const before = await page.evaluate(
    (key) => window.localStorage.getItem(key),
    localBookStoreKey,
  );
  const malformed = {
    kind: "amaru.book.bundle.v1",
    books: {
      wallets: [{ name: "Broken wallet", address: "not-a-cardano-address" }],
    },
  };

  await library.getByLabel("Book file").setInputFiles({
    name: "malformed-wallets.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(malformed)),
  });
  await expect(
    library.getByText(
      "Book import failed: bundle wallets[0].address is neither a 28-byte key hash nor a Cardano Bech32 address.",
      { exact: true },
    ),
  ).toBeVisible();
  expect(
    await page.evaluate((key) => window.localStorage.getItem(key), localBookStoreKey),
  ).toBe(before);

  const ambiguous = {
    kind: "amaru.book.bundle.v1",
    books: {
      wallets: [],
      "named:wallets": [],
    },
  };
  await library.getByLabel("Book file").setInputFiles({
    name: "ambiguous-wallets.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(ambiguous)),
  });
  await expect(
    library.getByText(
      "Book import failed: bundle books has both wallets and named:wallets; aliases are ambiguous.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(library.getByText(/neither a 28-byte key hash/)).toHaveCount(0);
  expect(
    await page.evaluate((key) => window.localStorage.getItem(key), localBookStoreKey),
  ).toBe(before);
});

test("the exact 2026-07-17 named wallets bundle imports and persists contract Turtle", async ({
  page,
}) => {
  await page.goto("/library");
  const library = page.locator(".library-page");
  const exactFixture = await readFile(attxBookBundlePath);

  await library.getByLabel("Book file").setInputFiles({
    name: "attx-book-bundle.json",
    mimeType: "application/json",
    buffer: exactFixture,
  });

  await expect(
    library.getByText("Imported Amaru book bundle (2 parts).", { exact: true }),
  ).toBeVisible();
  const importedBook = library.locator(".library-book", {
    hasText: "Amaru book bundle",
  });
  await expect(importedBook).toBeVisible();
  await expect(
    importedBook.getByRole("checkbox", { name: "Select Amaru book bundle" }),
  ).toBeChecked();

  const store = await storedBooks(page);
  const imported = store.books.find((book) => book.name === "Amaru book bundle");
  expect(imported).toMatchObject({
    source: "amaru.book.bundle.v1",
    raw: exactFixture.toString().trim(),
    selected: true,
    seed: false,
  });
  expect(imported.parts).toHaveLength(2);
  expect(imported.parts.map((part) => part.label)).toEqual([
    "network_compliance scope owner",
    "operator fuel wallet",
  ]);
  expect(imported.turtle).toContain(
    "<urn:cardano:id:key:8bd03209d227956aaf9670751e0aa2057b51c1537a43f155b24fb1c1>",
  );
  expect(imported.turtle).toContain("a overlay:Owner");
  expect(imported.turtle).toContain(
    'rdfs:label "network_compliance scope owner"',
  );
  expect(imported.turtle).toContain(
    "<urn:cardano:id:address:addr1qx9aqvsf6gne2640jec828s25gzhk5wp2day8u24kf8mrs2v0zyuvk80fay35dx008p45ts0u6cdrv9g2maetq8jm8psznjcrz>",
  );
  expect(imported.turtle).toContain("a overlay:Address");
  expect(imported.turtle).toContain('rdfs:label "operator fuel wallet"');
  expect(imported.turtle).toContain(
    'cardano:bech32 "addr1qx9aqvsf6gne2640jec828s25gzhk5wp2day8u24kf8mrs2v0zyuvk80fay35dx008p45ts0u6cdrv9g2maetq8jm8psznjcrz"',
  );
});

test("MD3 shell routes topbar nav and theme toggle", async ({ page }) => {
  await page.goto("/inspect");

  const topbar = page.getByRole("banner");
  const navigation = topbar.getByRole("navigation");
  const indexHtml = await readFile(
    path.join(repoRoot, "docs/inspector/dist/index.html"),
    "utf8",
  );
  expect(indexHtml).toContain("Material+Symbols+Outlined");
  expect(indexHtml).toContain("Roboto+Flex");
  expect(indexHtml).toContain("Roboto+Mono");

  await expect(
    topbar.getByText("Ledger Inspector", { exact: true }),
  ).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Workbench" })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Settings" })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Library" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Paste CBOR" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Decode" })).toBeVisible();

  const initialTheme = await page.evaluate(
    () => document.documentElement.dataset.theme,
  );
  const themeIcon = topbar.locator("md-icon").first();
  await expect(themeIcon).toBeVisible();
  await expect(themeIcon).toHaveCSS("font-family", /Material Symbols Outlined/);
  await expect(topbar.getByRole("button", { name: "dark_mode" })).toHaveCount(0);
  await expect(topbar.getByRole("button", { name: "light_mode" })).toHaveCount(0);
  await topbar.getByRole("button", { name: "Toggle theme" }).click();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.dataset.theme))
    .not.toBe(initialTheme);

  await navigation.getByRole("link", { name: "Settings" }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.locator(".provider-panel")).toBeVisible();
  await expect(page.getByRole("radio", { name: "Blockfrost" })).toBeVisible();
  await expect(page.getByRole("radio", { name: "Koios" })).toBeVisible();
  await expect(page.getByRole("switch", { name: "Persist API credentials" })).toHaveCount(0);
  await expect(page.getByText("Credentials stay in memory and can persist only in the encrypted vault.")).toBeVisible();

  await navigation.getByRole("link", { name: "Library" }).click();
  await expect(page).toHaveURL(/\/library$/);
  await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();
  await expect(page.locator(".library-page")).toBeVisible();
  await expect(page.getByText("Library placeholder", { exact: true })).toHaveCount(0);
});

test("MD3 shell keeps route navigation inside deployed subpaths", async ({
  page,
}) => {
  await withPrefixedInspectorSite(async (baseUrl) => {
    const routes = [
      { path: "inspect", assert: async () => {
        await expect(page.getByRole("tab", { name: "Paste CBOR" })).toBeVisible();
      } },
      { path: "settings", assert: async () => {
        await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
        await expect(page.locator(".provider-panel")).toBeVisible();
      } },
      { path: "library", assert: async () => {
        await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();
        await expect(page.locator(".library-page")).toBeVisible();
        await expect(page.locator(".library-book .cm-content").first()).toBeVisible();
        await expect(page.getByText("Library placeholder", { exact: true })).toHaveCount(0);
      } },
    ];

    for (const route of routes) {
      await page.goto(`${baseUrl}${route.path}/`);
      await route.assert();
      expect(page.url().startsWith(`${baseUrl}${route.path}`)).toBe(true);
      expect(new URL(page.url()).pathname).not.toBe(`/${route.path}`);
      await page.reload();
      await route.assert();
      expect(page.url().startsWith(`${baseUrl}${route.path}`)).toBe(true);
    }

    const navigation = page.getByRole("banner").getByRole("navigation");
    await navigation.getByRole("link", { name: "Workbench" }).click();
    await expect(page.getByRole("tab", { name: "Paste CBOR" })).toBeVisible();
    expect(page.url().startsWith(`${baseUrl}inspect`)).toBe(true);
    expect(new URL(page.url()).pathname).not.toBe("/inspect");
  });
});

test("MD3 inspector surfaces expose tokenized panels and controls", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("cardano-ledger-inspector-theme", "light");
  });
  await page.goto("/settings");

  const providerPanel = page.locator(".provider-panel");

  await expect(providerPanel).toHaveAttribute("data-md3-surface", "provider");
  await expect(page.getByRole("radio", { name: "Blockfrost" })).toBeVisible();
  await expect(page.getByRole("radio", { name: "mainnet" })).toBeVisible();
  await expect(page.getByRole("switch", { name: "Persist API credentials" })).toHaveCount(0);

  await expectColorToken(
    page,
    providerPanel,
    "backgroundColor",
    "--md-sys-color-surface-container-low",
  );
  await expectColorToken(
    page,
    providerPanel,
    "borderColor",
    "--md-sys-color-outline-variant",
  );

  const lightBackground = await providerPanel.evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  );
  await page.getByRole("button", { name: "Toggle theme" }).click();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.dataset.theme))
    .toBe("dark");
  await expectColorToken(
    page,
    providerPanel,
    "backgroundColor",
    "--md-sys-color-surface-container-low",
  );
  await expect(providerPanel).not.toHaveCSS("background-color", lightBackground);

  await page.goto("/inspect");
  const inputPanel = page.locator(".input-panel");
  await expect(inputPanel).toHaveAttribute("data-md3-surface", "input");
  await expect(page.locator("md-filled-button", { hasText: "Decode" })).toHaveAttribute(
    "data-md3-control",
    "primary",
  );

  await decodeFixtureAt(page, "/inspect");

  const loadedHeader = page.locator(".loaded-inspector-header");
  const resultPanel = page.locator(".result-panel");
  const decodedTreePanel = decodedPanel(page);
  await selectResultTab(page, "Validation");
  const validationPanel = page.locator(".validation-panel");
  await selectResultTab(page, "Graph / RDF");
  const rdfPanel = page.locator(".rdf-panel");
  const lensPanel = page.locator(".sparql-lens-panel").first();

  await expect(page.locator(".provider-panel")).toHaveCount(0);
  await expect(loadedHeader).toBeVisible();
  await expect(resultPanel).toHaveClass(/decoded-result-shell/);
  await selectResultTab(page, "Structure");
  await expect(decodedTreePanel).toHaveClass(/decoded-screen/);
  await expect(page.locator(".compact-identity-panel")).toHaveAttribute(
    "data-md3-surface",
    "decoded",
  );
  await expect(
    decodedTreePanel.locator("md-outlined-button", { hasText: "Expand" }),
  ).toHaveAttribute("data-md3-control", "secondary");
  await selectResultTab(page, "Validation");
  await expect(validationPanel).toHaveAttribute("data-md3-surface", "decoded");
  await selectResultTab(page, "Graph / RDF");
  await expect(rdfPanel).toHaveAttribute("data-md3-surface", "decoded");
  await expect(lensPanel).toHaveAttribute("data-md3-surface", "decoded");

  await expect(page.locator("md-outlined-button", { hasText: "Copy current" })).toHaveAttribute(
    "data-md3-control",
    "inline",
  );
});

test("inspect lays out input, support panels, and decoded result", async ({
  page,
}) => {
  await page.goto("/inspect");

  await expect(page.locator(".provider-panel")).toHaveCount(0);
  const workspace = page.locator(".workspace");
  const supportGrid = workspace.locator(".initial-support-grid");
  const settingsSummary = workspace.locator(".settings-summary");
  const inputPanel = workspace.locator(".input-panel");
  const booksPanel = workspace.locator(".books-panel");
  const resultPanel = workspace.locator(".result-panel");

  await expect(page.locator(".workspace-left")).toHaveCount(0);
  await expect(page.locator(".workspace-right")).toHaveCount(0);
  await expect(settingsSummary).toBeVisible();
  await expect(settingsSummary).toContainText("Blockfrost");
  await expect(settingsSummary).toContainText("mainnet");
  await expect(settingsSummary.getByRole("link", { name: "Settings" })).toBeVisible();
  await expect(inputPanel).toBeVisible();
  await expect(inputPanel.getByRole("heading", { name: "Inspect a Cardano transaction" })).toBeVisible();
  await expect(inputPanel).toContainText("Decodes locally in browser");
  await expect(inputPanel.getByRole("tab", { name: "Paste CBOR" })).toBeVisible();
  await expect(inputPanel.getByRole("tab", { name: "Fetch by hash" })).toBeVisible();
  await expect(inputPanel.locator(".example-valid")).toBeVisible();
  await expect(inputPanel.locator(".example-violation").first()).toBeVisible();
  await expect(supportGrid).toBeVisible();
  await expect(booksPanel.getByRole("heading", { name: "Resolution books" })).toBeVisible();
  await expect(inputPanel.locator(".books-panel")).toHaveCount(0);
  await expect(resultPanel.getByRole("heading", { name: "No transaction decoded yet" })).toBeVisible();
  await expect(decodedPanel(resultPanel).locator(".decoded-tree-container")).toHaveCount(0);

  const emptyStack = await workspace.evaluate((root) => {
    const rectForElement = (element) => {
      const rect = element.getBoundingClientRect();
      return {
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left,
        right: rect.right,
        width: rect.width,
      };
    };
    const rectFor = (selector) => {
      const element = root.querySelector(selector);
      return element ? rectForElement(element) : null;
    };
    return {
      workspace: rectForElement(root),
      input: rectFor(".input-panel"),
      support: rectFor(".initial-support-grid"),
      books: rectFor(".books-panel"),
      config: rectFor(".settings-summary"),
      result: rectFor(".result-panel"),
    };
  });
  expect(emptyStack.workspace).not.toBeNull();
  expect(emptyStack.input).not.toBeNull();
  expect(emptyStack.support).not.toBeNull();
  expect(emptyStack.books).not.toBeNull();
  expect(emptyStack.config).not.toBeNull();
  expect(emptyStack.result).not.toBeNull();
  expect(emptyStack.input.bottom).toBeLessThanOrEqual(emptyStack.support.top + 1);
  expect(emptyStack.support.bottom).toBeLessThanOrEqual(emptyStack.result.top + 1);
  expect(Math.abs(emptyStack.books.top - emptyStack.config.top)).toBeLessThanOrEqual(1);
  expect(emptyStack.books.right).toBeLessThanOrEqual(emptyStack.config.left + 1);
  expect(emptyStack.input.width).toBeGreaterThan(emptyStack.workspace.width * 0.92);
  expect(emptyStack.support.width).toBeGreaterThan(emptyStack.workspace.width * 0.92);
  expect(emptyStack.result.width).toBeGreaterThan(emptyStack.workspace.width * 0.92);
  expect(Math.abs(emptyStack.input.left - emptyStack.result.left)).toBeLessThanOrEqual(4);

  for (const width of [640, 960]) {
    await page.setViewportSize({ width, height: 900 });
    const overflow = await page.evaluate(() => {
      const scrollWidth = Math.max(
        document.documentElement.scrollWidth,
        document.body.scrollWidth,
      );
      return scrollWidth - window.innerWidth;
    });
    expect(overflow).toBeLessThanOrEqual(1);
  }
  await page.setViewportSize({ width: 1280, height: 720 });

  const booksList = booksPanel.locator(".books-list");
  const booksOverflow = await booksList.evaluate((element) => {
    const styles = getComputedStyle(element);
    return {
      maxHeight: styles.maxHeight,
      overflow: styles.overflow,
      overflowY: styles.overflowY,
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
    };
  });
  expect(booksOverflow.maxHeight).not.toBe("150px");
  expect(booksOverflow.overflow).not.toBe("hidden");
  expect(booksOverflow.overflowY).not.toBe("hidden");
  expect(booksOverflow.clientHeight).toBeGreaterThanOrEqual(booksOverflow.scrollHeight);

  await page.getByRole("tab", { name: "Paste CBOR" }).click();
  await page.getByPlaceholder("Paste Conway transaction CBOR hex").fill("not-a-conway-hex");
  await page.getByRole("button", { name: "Decode" }).click();
  await expect(resultPanel).toContainText(/malformed_hex|invalid/i);
  await expect(page.locator(".loaded-inspector-header")).toHaveCount(0);
  await expect(inputPanel).toBeVisible();
  await expect(booksPanel).toBeVisible();
  await expect(resultPanel).toBeVisible();

  const errorStack = await workspace.evaluate((root) => {
    const rectForElement = (element) => {
      const rect = element.getBoundingClientRect();
      return {
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
      };
    };
    const rectFor = (selector) => {
      const element = root.querySelector(selector);
      return element ? rectForElement(element) : null;
    };
    return {
      workspace: rectForElement(root),
      input: rectFor(".input-panel"),
      support: rectFor(".initial-support-grid"),
      books: rectFor(".books-panel"),
      result: rectFor(".result-panel"),
    };
  });
  expect(errorStack.input.bottom).toBeLessThanOrEqual(errorStack.support.top + 1);
  expect(errorStack.support.bottom).toBeLessThanOrEqual(errorStack.result.top + 1);
  expect(errorStack.result.width).toBeGreaterThan(errorStack.workspace.width * 0.92);

  const txCbor = (await readFile(fixturePath, "utf8")).trim();
  await page.getByPlaceholder("Paste Conway transaction CBOR hex").fill(txCbor);
  await page.getByRole("button", { name: "Decode" }).click();

  const loadedHeader = page.locator(".loaded-inspector-header");
  await expect(loadedHeader).toBeVisible();
  await expect(inputPanel).toHaveCount(0);
  await expect(booksPanel).toHaveCount(0);
  await expect(resultPanel.getByRole("tab", { name: "Structure" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(decodedPanel(resultPanel)).toBeVisible();

  const loadedStack = await workspace.evaluate((root) => {
    const rectForElement = (element) => {
      const rect = element.getBoundingClientRect();
      return {
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left,
        width: rect.width,
      };
    };
    const rectFor = (selector) => {
      const element = root.querySelector(selector);
      return element ? rectForElement(element) : null;
    };
    return {
      workspace: rectForElement(root),
      header: rectFor(".loaded-inspector-header"),
      result: rectFor(".result-panel"),
    };
  });
  expect(loadedStack.header).not.toBeNull();
  expect(loadedStack.result).not.toBeNull();
  expect(loadedStack.header.bottom).toBeLessThanOrEqual(loadedStack.result.top + 1);
  expect(loadedStack.result.width).toBeGreaterThan(loadedStack.workspace.width * 0.92);
  expect(Math.abs(loadedStack.header.left - loadedStack.result.left)).toBeLessThanOrEqual(4);

  await loadedHeader.getByRole("button", { name: "Change input" }).click();
  await expect(inputPanel).toBeVisible();
  await expect(booksPanel).toBeVisible();
  await expect(decodedPanel(resultPanel)).toBeVisible();
  await expect(page.getByPlaceholder("Paste Conway transaction CBOR hex")).toHaveValue(txCbor);

  await page.getByRole("button", { name: "Decode" }).click();
  await expect(loadedHeader).toBeVisible();
  await expect(inputPanel).toHaveCount(0);
  await expect(booksPanel).toHaveCount(0);
  await expect(decodedPanel(resultPanel)).toBeVisible();
});

test("settings changes provider state used by inspect hash decode", async ({ page }) => {
  const txCbor = (await readFile(fixturePath, "utf8")).trim();
  const validationContext = await loadValidationContext();
  const requestedHashes = [];
  let tipRequests = 0;
  let protocolParameterRequests = 0;

  await installClipboardMock(page);
  await page.route("https://preview.koios.rest/api/v1/tx_cbor", async (route) => {
    const requestBody = route.request().postDataJSON();
    requestedHashes.push(...requestBody._tx_hashes);
    expect(route.request().headers().authorization).toBe("Bearer koios-settings-token");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        requestBody._tx_hashes.map((txHash) => ({
          cbor: producerCbor(validationContext, txHash, txCbor),
        })),
      ),
    });
  });
  await page.route("https://preview.koios.rest/api/v1/tip", async (route) => {
    tipRequests += 1;
    expect(route.request().headers().authorization).toBe("Bearer koios-settings-token");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          abs_slot: Number(validationContext.slot),
          epoch_no: Number(validationContext.epoch),
        },
      ]),
    });
  });
  await page.route(
    "https://preview.koios.rest/api/v1/cli_protocol_params",
    async (route) => {
      protocolParameterRequests += 1;
      expect(route.request().headers().authorization).toBe("Bearer koios-settings-token");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(validationContext.protocol_parameters),
      });
    },
  );

  await configureChainData(page, {
    provider: "Koios",
    network: "preview",
    koiosBearer: "koios-settings-token",
  });

  await openInspectViaShell(page);
  await expect(page.locator(".settings-summary")).toContainText("Koios");
  await expect(page.locator(".settings-summary")).toContainText("preview");
  await page
    .getByPlaceholder("Transaction hash (64 hex chars)")
    .fill("0".repeat(64));
  await page.getByRole("button", { name: "Decode" }).click();

  await expect(
    page.getByRole("heading", { name: "Identity metadata" }),
  ).toBeVisible();
  expect(requestedHashes).toContain("0".repeat(64));
  expect(tipRequests).toBe(1);
  expect(protocolParameterRequests).toBe(1);
});

test("decodes a Conway transaction and exposes compact identity values", async ({
  page,
}) => {
  await decodeFixture(page);

  await expect(page.getByText("Transaction ID", { exact: true })).toBeVisible();
  await expect(page.getByText("Body hash", { exact: true })).toBeVisible();

  const summaryIdentity = page.locator(".compact-identity-panel .identity-grid");
  const txIdRow = summaryIdentity.locator(".identity-row", { hasText: "Transaction ID" });
  const txId = await txIdRow.locator("code").innerText();
  await txIdRow.locator("code").click();
  await expect(txIdRow).toHaveClass(/is-copied/);
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe(txId);

  const bodyHashRow = summaryIdentity.locator(".identity-row", { hasText: "Body hash" });
  const bodyHash = await bodyHashRow.locator("code").innerText();
  await bodyHashRow.locator("code").click();
  await expect(bodyHashRow).toHaveClass(/is-copied/);
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe(bodyHash);
});

test("loaded header surfaces tx id and CBOR", async ({ page }) => {
  const txFixturePath = await contingencySignedTxFixture();
  const txCbor = (await readFile(txFixturePath, "utf8")).trim();

  await decodeFixtureAt(page, "/", txFixturePath);

  const loadedHeader = page.locator(".loaded-inspector-header");
  await expect(loadedHeader).toBeVisible();

  const txIdRow = loadedHeader.locator(".loaded-context-item").filter({
    has: page.getByText("Tx id/hash", { exact: true }),
  });
  await expect(txIdRow).toBeVisible();
  await expect(txIdRow.locator("code")).toHaveText(contingencyTxId);

  const cborRow = loadedHeader.locator(".loaded-context-item").filter({
    has: page.getByText("CBOR", { exact: true }),
  });
  await expect(cborRow).toBeVisible();
  const cborValue = cborRow.locator("code");
  await expect(cborValue).toContainText(txCbor.slice(0, 16));
  await expect(cborValue).toContainText(txCbor.slice(-8));
  const visibleCbor = await cborValue.innerText();
  expect(visibleCbor.length).toBeLessThan(txCbor.length);

  await cborRow.getByRole("button", { name: "Copy CBOR" }).click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe(txCbor);

  await txIdRow.getByRole("button", { name: "Copy Tx id/hash" }).click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe(contingencyTxId);
});

test("renders the transaction RDF graph after decode", async ({ page }) => {
  await decodeFixture(page);

  await selectResultTab(page, "Graph / RDF");
  const rdfPanel = page.locator(".rdf-panel");
  await expect(
    rdfPanel.getByRole("heading", { name: "Transaction RDF graph" }),
  ).toBeVisible();
  await expect(rdfPanel.getByText("text/turtle", { exact: true })).toBeVisible();

  const turtle = rdfPanel.locator(".rdf-turtle");
  await expect(turtle).toContainText("@prefix cardano:");
  await expect(turtle).toContainText("cardano:Transaction");

  const lensPanel = page.locator(".sparql-lens-panel");
  await expect(
    lensPanel.getByRole("heading", {
      name: "SPARQL lens: transaction outputs",
    }),
  ).toBeVisible();
  await expect(lensPanel.locator(".sparql-lens-row").first()).toBeVisible();
  await expect(lensPanel.getByText("5", { exact: true })).toBeVisible();
  await expect(lensPanel.getByText(/urn:cardano:tx:/)).toBeVisible();
});

test("renders decoded-structure tree from RDF rows", async ({ page }) => {
  await decodeFixture(page);

  const decodedTreePanel = decodedPanel(page);
  await expect(
    decodedTreePanel.getByRole("heading", { name: "Decoded transaction" }),
  ).toBeVisible();
  await expect(decodedTreePanel.locator(".decoded-structure-placeholder")).toHaveCount(0);
  await expect(decodedTreePanel.locator(".decoded-quick-stats")).toBeVisible();
  await expect(decodedTreePanel.locator(".decoded-toolbar")).toBeVisible();
  await expect(decodedTreePanel.locator(".decoded-byte-grid")).toBeVisible();
  await expandDecodedStructure(decodedTreePanel);

  const rootRow = decodedRowWithKey(decodedTreePanel, page, /^Transaction$/, { depth: 0 }).first();
  await expect(rootRow).toBeVisible();
  const transactionTypeHref =
    "https://lambdasistemi.github.io/cardano-ledger-rdf/vocab/cardano#Transaction";
  await expect(rootRow.locator(".decoded-tree-count")).toHaveText("2");
  await expect(rootRow).not.toContainText(transactionTypeHref);

  const txHash = decodedTreePanel.locator(".decoded-tx-hash span").first();
  const fullTxHash = await txHash.getAttribute("title");
  expect(fullTxHash).toMatch(/^[0-9a-f]{64}$/i);
  await expect(txHash).toContainText(/[0-9a-f]{64}/i);
  await expect(txHash.getByRole("link")).toHaveCount(0);

  for (const section of [
    "transaction",
    "body",
    "inputs",
    "outputs",
    "witness_set",
    "vkeys",
    "redeemers",
    "metadata",
  ]) {
    await expect(
      decodedTreePanel.getByRole("button", { name: new RegExp(`^${section}\\b`) }),
    ).toBeVisible();
  }

  const scalarBodyRow = (label) =>
    decodedTreePanel.locator(".decoded-tree-row.decoded-tree-depth-3", {
      has: page.locator(".decoded-tree-key", {
        hasText: new RegExp(`^${label}$`),
      }),
    });

  const validityRow = decodedTreePanel.locator(".decoded-tree-row.decoded-tree-depth-2", {
    has: page.locator(".decoded-tree-key", {
      hasText: /^is_valid$/,
    }),
  });
  await expect(validityRow).toBeVisible();
  await expect(validityRow.locator(".decoded-tree-type")).toHaveCount(1);
  await expect(validityRow).not.toContainText("cardano:Transaction");
  await expect(validityRow).not.toContainText(
    "https://lambdasistemi.github.io/cardano-ledger-rdf/vocab/cardano#isValid",
  );

  const feeRow = scalarBodyRow("fee");
  await expect(feeRow).toBeVisible();
  await expect(feeRow.locator(".decoded-tree-type")).toHaveCount(1);
  await expect(feeRow).not.toContainText("cardano:Transaction");
  await expect(feeRow).not.toContainText(
    "https://lambdasistemi.github.io/cardano-ledger-rdf/vocab/cardano#hasFee",
  );

  const totalCollateralRow = scalarBodyRow("total_collateral");
  if ((await totalCollateralRow.count()) > 0) {
    await expect(totalCollateralRow.locator(".decoded-tree-type")).toHaveCount(1);
    await expect(totalCollateralRow).not.toContainText("cardano:Transaction");
    await expect(totalCollateralRow).not.toContainText(
      "https://lambdasistemi.github.io/cardano-ledger-rdf/vocab/cardano#totalCollateral",
    );
  }

  await expect(
    decodedTreePanel.locator(".decoded-tree-row", { hasText: "Output 0" }),
  ).toBeVisible();
  await expect(
    decodedTreePanel.locator(".decoded-tree-row", { hasText: "Index" }).first(),
  ).toContainText("0");
  await expect(
    decodedTreePanel.locator(".decoded-tree-row", { hasText: "Lovelace" }).first(),
  ).toBeVisible();

  await expect(
    decodedTreePanel.locator(".decoded-tree-row", { hasText: "Key witness" }).first(),
  ).toBeVisible();

  await expect(
    decodedTreePanel.locator(".decoded-tree-row", { hasText: "Metadata label" }).first(),
  ).toBeVisible();

  await selectResultTab(page, "Graph / RDF");
  const rdfPanel = page.locator(".rdf-panel");
  await expect(
    rdfPanel.getByRole("heading", { name: "Transaction RDF graph" }),
  ).toBeVisible();
  await expect(rdfPanel.locator(".rdf-turtle")).toContainText("cardano:Transaction");

  const lensPanel = page.locator(".sparql-lens-panel");
  await expect(
    lensPanel.getByRole("heading", {
      name: "SPARQL lens: transaction outputs",
    }),
  ).toBeVisible();
  await expect(lensPanel.locator(".sparql-lens-row").first()).toBeVisible();
});

test("faithful CQuisitor parity renders Conway structure for the Amaru treasury corpus", async ({
  page,
}) => {
  test.setTimeout(180_000);

  const fixtures = await signedTxFixtures();
  expect(
    fixtures.length,
    `${amaruTreasuryTx2026Root} signed-tx.hex corpus should be non-empty`,
  ).toBeGreaterThan(0);

  const validationContext = await loadValidationContext();
  await installClipboardMock(page);
  await mockKoiosValidationContext(page, validationContext);
  await page.goto("/");

  let checkedContingencyGolden = false;
  for (const txFixturePath of fixtures) {
    const txCbor = (await readFile(txFixturePath, "utf8")).trim();
    const shape = walkConwayTransactionCbor(txCbor);
    await submitTxCbor(page, txCbor);

    const rows = await decodedStructureRows(page);
    const fixtureName = path.relative(amaruTreasuryTx2026Root, txFixturePath);
    expectRenderedConwayShape(rows, shape, fixtureName);

    if (txFixturePath.includes(contingencyTxId)) {
      checkedContingencyGolden = true;
      expect(
        renderedConwayFieldTree(rows),
        "18d57a4f contingency CQuisitor field tree",
      ).toEqual({
        top_level: ["transaction_hash", "transaction"],
        transaction: ["body", "witness_set", "is_valid", "auxiliary_data"],
        body: conwayBodyFields.map((field) => field.label),
        witness_set: conwayWitnessFields.map((field) => field.label),
        auxiliary_data: conwayAuxiliaryDataFields,
      });
    }
  }

  expect(
    checkedContingencyGolden,
    `expected to cover contingency transaction ${contingencyTxId}`,
  ).toBe(true);
});

test("decoded structure toggles collapse and expand direct children", async ({
  page,
}) => {
  const txFixturePath = await contingencySignedTxFixture();
  const txCbor = (await readFile(txFixturePath, "utf8")).trim();
  await decodeTxCbor(page, "/", txCbor);

  const decodedTreePanel = decodedPanel(page);
  const bodyRow = decodedRowWithKey(decodedTreePanel, page, /^body$/, { depth: 2 }).first();
  await expect(bodyRow).toBeVisible();

  const initiallyVisibleChildren =
    (await directDecodedTreeChildLabels(bodyRow)).map(normalizeStructureLabel);
  expect(initiallyVisibleChildren).toEqual(
    expect.arrayContaining(["inputs", "outputs", "fee"]),
  );

  await bodyRow.click();
  await expect(directDecodedTreeChildLabels(bodyRow)).resolves.toEqual([]);

  await bodyRow.click();
  const restoredChildren =
    (await directDecodedTreeChildLabels(bodyRow)).map(normalizeStructureLabel);
  expect(restoredChildren).toEqual(
    expect.arrayContaining(["inputs", "outputs", "fee"]),
  );
});

test("decodes genuine Conway fixture into RDF tree", async ({
  page,
}) => {
  const txCbor = (await readFile(conwayMainnetFixturePath, "utf8")).trim();
  const validationContext = await loadValidationContext();

  await installClipboardMock(page);
  await mockKoiosValidationContext(page, validationContext);

  await page.goto("/");
  await page.getByRole("tab", { name: "Paste CBOR" }).click();
  await page.getByPlaceholder("Paste Conway transaction CBOR hex").fill(txCbor);
  await page.getByRole("button", { name: "Decode" }).click();

  const body = page.locator("body");
  await expect(page.getByRole("heading", { name: /Decoded transaction|stderr/ })).toBeVisible();
  await expect(body).not.toContainText(/malformed_cbor|DeserialiseFailure/);
  await expect(
    page.getByRole("heading", { name: "Identity metadata" }),
  ).toBeVisible();

  const decodedTreePanel = decodedPanel(page);
  await expect(decodedTreePanel.locator(".decoded-structure-placeholder")).toHaveCount(0);
  await expect(decodedTreePanel.getByText("Tree renderer pending.", { exact: true })).toHaveCount(0);

  const rootRow = decodedRowWithKey(decodedTreePanel, page, /^Transaction$/, { depth: 0 }).first();
  await expect(rootRow).toBeVisible();
  await expect(decodedTreePanel.locator(".decoded-tx-hash span").first()).toContainText(
    /[0-9a-f]{64}/i,
  );

  for (const section of ["outputs", "vkeys"]) {
    await expect(
      decodedTreePanel.getByRole("button", { name: new RegExp(`^${section}\\b`) }),
    ).toBeVisible();
  }

  await decodedTreePanel.getByRole("button", { name: /^outputs\b/ }).click();
  await expect(
    decodedTreePanel.locator(".decoded-tree-row", { hasText: "Output 0" }),
  ).toBeVisible();

  await decodedTreePanel.getByRole("button", { name: /^vkeys\b/ }).click();
  await expect(
    decodedTreePanel.locator(".decoded-tree-row", { hasText: /Key witness|Script witness|Redeemer/ }).first(),
  ).toBeVisible();
});

test("preview subpath decodes genuine Conway fixture into RDF tree", async ({
  page,
}) => {
  await withPrefixedInspectorSite(async (baseUrl) => {
    await decodeFixtureAt(page, `${baseUrl}inspect/`, conwayMainnetFixturePath);

    const body = page.locator("body");
    await expect(body).not.toContainText(/malformed_cbor|DeserialiseFailure/);

    const decodedTreePanel = decodedPanel(page);
    await expect(decodedTreePanel.locator(".decoded-structure-placeholder")).toHaveCount(0);
    await expect(decodedTreePanel.getByText("Tree renderer pending.", { exact: true })).toHaveCount(0);
    await expect(
      decodedRowWithKey(decodedTreePanel, page, /^Transaction$/, { depth: 0 }).first(),
    ).toBeVisible();
    await expect(decodedTreePanel.getByRole("button", { name: /^outputs\b/ })).toBeVisible();
    await expect(decodedTreePanel.getByRole("button", { name: /^vkeys\b/ })).toBeVisible();
  });
});

test("preview subpath fetches split wasm assets while decode and RDF still work", async ({
  page,
}) => {
  const wasmResponses = [];
  page.on("response", (response) => {
    if (new URL(response.url()).pathname.endsWith(".wasm")) {
      wasmResponses.push(response);
    }
  });

  await withPrefixedInspectorSite(async (baseUrl) => {
    await decodeFixtureAt(page, `${baseUrl}inspect/`, conwayMainnetFixturePath);
    await selectResultTab(page, "Graph / RDF");

    await expect(
      page
        .getByRole("tabpanel", { name: "Graph / RDF" })
        .getByRole("heading", { name: "Transaction RDF graph" }),
    ).toBeVisible();
  });

  await expect.poll(() => wasmResponses.length).toBeGreaterThanOrEqual(2);

  const observed = await Promise.all(
    wasmResponses.map(async (response) => ({
      fileName: path.basename(new URL(response.url()).pathname),
      status: response.status(),
      contentType: await response.headerValue("content-type"),
    })),
  );

  expect(observed).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        fileName: expect.stringMatching(/^inspector\.[A-Za-z0-9_-]+\.wasm$/),
        status: 200,
        contentType: expect.stringContaining("application/wasm"),
      }),
      expect.objectContaining({
        fileName: expect.stringMatching(/^rdf_shapes_wasm_bg\.[A-Za-z0-9_-]+\.wasm$/),
        status: 200,
        contentType: expect.stringContaining("application/wasm"),
      }),
    ]),
  );
});

test("preview deep route loads address WASM from the bundle-derived URL", async ({
  page,
}) => {
  const addressWasmResponses = [];
  page.on("response", (response) => {
    if (
      path.basename(new URL(response.url()).pathname).startsWith("cardano-addresses.")
    ) {
      addressWasmResponses.push(response);
    }
  });

  let expectedAssetBase;
  await withPrefixedInspectorSite(async (baseUrl) => {
    expectedAssetBase = new URL(baseUrl).pathname;
    await page.goto(`${baseUrl}inspect/`);

    const result = await page.evaluate(
      async (address) => globalThis.inspectCardanoAddress(address),
      "addr1vyeq0sedsphv9j4u0rlhakrfh5cf3d7mj0zrej92jw44n6c0fpycd",
    );

    expect(result).toMatchObject({
      addressStyle: "Shelley",
      addressTypeLabel: "Enterprise address (key)",
      networkTag: 1,
      networkTagLabel: "Mainnet",
    });
  });

  await expect.poll(() => addressWasmResponses.length).toBe(1);
  const response = addressWasmResponses[0];
  const responseUrl = new URL(response.url());
  expect(responseUrl.pathname).toMatch(
    new RegExp(`^${expectedAssetBase}cardano-addresses\\.[A-Za-z0-9_-]+\\.wasm$`),
  );
  expect(response.status()).toBe(200);
  expect(await response.headerValue("content-type")).toContain("application/wasm");
});

test("inspect result is tree-primary tabs after genuine decode", async ({ page }) => {
  await decodeFixtureAt(page, "/inspect", conwayMainnetFixturePath);
  await expectTabbedInspectResult(page);

  await withPrefixedInspectorSite(async (baseUrl) => {
    await decodeFixtureAt(page, `${baseUrl}inspect/`, conwayMainnetFixturePath);
    await expectTabbedInspectResult(page);
  });
});

test("CQuisitor inspect layout keeps decoded tree primary after genuine decode and subpath", async ({
  page,
}, testInfo) => {
  await expectCQuisitorInspectSurface(page, "/inspect", testInfo, true);

  await withPrefixedInspectorSite(async (baseUrl) => {
    await expectCQuisitorInspectSurface(page, `${baseUrl}inspect/`, testInfo);
  });
});

test("selected library overlay book parts produce deterministic Turtle", async ({
  page,
}) => {
  await page.goto("/library");
  const library = page.locator(".library-page");
  const amaruBook = library.locator(".library-book", {
    hasText: "Amaru treasury 2026 overlay",
  });
  await expect(amaruBook).toBeVisible();
  await expect(
    amaruBook.getByRole("checkbox", { name: "Select Amaru treasury 2026 overlay" }),
  ).toBeChecked();

  await decodeFixtureAt(page, "/inspect");

  await selectResultTab(page, "Graph / RDF");
  const overlayPanel = page.locator(".overlay-book-panel");
  await expect(
    overlayPanel.getByRole("heading", { name: "Selected books" }),
  ).toBeVisible();

  const selectedTurtle = overlayPanel.getByLabel("Selected overlay Turtle");
  const resolvedLabelsPanel = page.locator(".resolved-labels-panel");
  await expect(selectedTurtle).toHaveValue(/Amaru Core Development treasury/);
  await expect(selectedTurtle).toHaveValue(/@prefix cardano:/);
  await expect(
    resolvedLabelsPanel.getByRole("heading", {
      name: "SPARQL lens: resolved labels",
    }),
  ).toBeVisible();
  await expect(
    resolvedLabelsPanel.getByText("Amaru Core Development treasury", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    resolvedLabelsPanel.getByText("Treasury", { exact: true }).first(),
  ).toBeVisible();

  await page.getByRole("banner").getByRole("link", { name: "Library" }).click();
  await amaruBook
    .getByRole("checkbox", { name: "Select Amaru treasury 2026 overlay" })
    .uncheck();
  await openInspectViaShell(page);
  await selectResultTab(page, "Graph / RDF");
  await overlayPanel.getByRole("button", { name: "Apply selected books" }).click();

  await expect(selectedTurtle).not.toHaveValue(/Amaru Core Development treasury/);
  await expect(
    resolvedLabelsPanel.getByText("Amaru Core Development treasury", {
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    resolvedLabelsPanel.getByText("No resolved labels.", { exact: true }),
  ).toBeVisible();
});

test("generic hex-suffix credential resolution", async ({ page }) => {
  const owners = [
    {
      label: "Amaru Network Compliance owner key",
      hash: "8bd03209d227956aaf9670751e0aa2057b51c1537a43f155b24fb1c1",
    },
    {
      label: "Amaru Ops And Use Cases owner key",
      hash: "f3ab64b0f97dcf0f91232754603283df5d75a1201337432c04d23e2e",
    },
  ];

  await decodeFixtureAt(page, "/", signingIntentFixturePath);
  await selectResultTab(page, "Graph / RDF");

  const resolvedLabelsPanel = page.locator(".resolved-labels-panel");
  for (const owner of owners) {
    const row = resolvedLabelsPanel
      .locator(".resolved-labels-row")
      .filter({ hasText: owner.label });
    await expect(row).toHaveCount(1);
    await expect(row.getByText(owner.label, { exact: true })).toBeVisible();
    await expect(row.locator(".sparql-lens-cell").last().locator("code")).toHaveText(
      `urn:cardano:id:PaymentKey:${owner.hash}`,
    );
  }

  const existingResolution = resolvedLabelsPanel
    .locator(".resolved-labels-row")
    .filter({
      has: page.getByText("Amaru Core Development treasury", { exact: true }),
    });
  await expect(existingResolution).toHaveCount(1);
  await expect(existingResolution.locator(".sparql-lens-cell").last().locator("code")).toHaveText(
    "core_development",
  );
});

test("resolves decoded-tree address rows from selected Turtle overlay books", async ({
  page,
}) => {
  await decodeFixture(page, conwayMainnetFixturePath);

  const decodedTreePanel = decodedPanel(page);
  await expandDecodedStructure(decodedTreePanel);

  const addressRow = decodedTreePanel
    .locator(".decoded-tree-row")
    .filter({ hasText: "Address" })
    .first();
  await expect(addressRow).toBeVisible();

  const rawAddress = await decodedRowText(addressRow);
  expect(rawAddress).toMatch(/^[0-9a-f]+$/);
  expect(rawAddress.length).toBeGreaterThanOrEqual(24);

  await selectResultTab(page, "Graph / RDF");
  const turtleText = await page.locator(".rdf-panel .rdf-turtle").innerText();
  const address = await page.evaluate((graph) => {
    const result = globalThis.rdfShapes.query(
      graph,
      `
        PREFIX cardano: <https://lambdasistemi.github.io/cardano-ledger-rdf/vocab/cardano#>
        SELECT ?bech32 WHERE {
          ?transaction a cardano:Transaction ;
            cardano:hasOutput ?output .
          ?output cardano:hasIndex 0 ;
            cardano:atAddress ?address .
          ?address cardano:bech32 ?bech32 .
        }
        LIMIT 1
      `,
    );
    return result.json.results.bindings[0].bech32.value;
  }, turtleText);
  expect(address).toMatch(/^addr1/);

  const resolvedLabel = "Fixture decoded treasury address";
  await selectResultTab(page, "Structure");
  await expect(decodedTreePanel.getByText(resolvedLabel, { exact: true })).toHaveCount(0);
  await expect(addressRow).toContainText(rawAddress);

  const overlayTurtle = `
@prefix cardano: <https://lambdasistemi.github.io/cardano-ledger-rdf/vocab/cardano#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix fixture: <https://example.test/cardano-ledger-inspector/fixture#> .

fixture:decodedTreasuryAddress
  rdfs:label "${resolvedLabel}" ;
  cardano:bech32 "${address}" .
`;

  await page.getByRole("banner").getByRole("link", { name: "Library" }).click();
  await expect(page).toHaveURL(/\/library$/);
  const library = page.locator(".library-page");
  await library.getByLabel("Book Turtle").fill(overlayTurtle);
  await library.getByRole("button", { name: "Add book" }).click();
  await expect(
    library.getByRole("heading", { name: "Pasted overlay Turtle" }),
  ).toBeVisible();

  await openInspectViaShell(page);
  await selectResultTab(page, "Graph / RDF");
  const overlayPanel = page.locator(".overlay-book-panel");
  await overlayPanel.getByRole("button", { name: "Apply selected books" }).click();

  await selectResultTab(page, "Structure");
  await expandDecodedStructure(decodedTreePanel);
  const resolvedAddressRow = decodedTreePanel
    .locator(".decoded-tree-row")
    .filter({ hasText: "Address" })
    .filter({ hasText: resolvedLabel })
    .first();
  await expect(resolvedAddressRow).toContainText(resolvedLabel);
  await expect(resolvedAddressRow.locator(".decoded-tree-resolved-name")).toContainText(
    resolvedLabel,
  );
  const resolvedRawAddress = await decodedRowRawText(resolvedAddressRow);
  expect(resolvedRawAddress).toMatch(/^[0-9a-f]+$/);
  expect(resolvedRawAddress.length).toBeGreaterThanOrEqual(24);
});

test("inspect resolves decoded-tree address rows from selected library books", async ({
  page,
}) => {
  await decodeFixtureAt(page, "/inspect", conwayMainnetFixturePath);

  await selectResultTab(page, "Graph / RDF");
  const firstTurtleText = await page.locator(".rdf-panel .rdf-turtle").innerText();
  const address = await page.evaluate((graph) => {
    const result = globalThis.rdfShapes.query(
      graph,
      `
        PREFIX cardano: <https://lambdasistemi.github.io/cardano-ledger-rdf/vocab/cardano#>
        SELECT ?bech32 WHERE {
          ?transaction a cardano:Transaction ;
            cardano:hasOutput ?output .
          ?output cardano:hasIndex 0 ;
            cardano:atAddress ?address .
          ?address cardano:bech32 ?bech32 .
        }
        LIMIT 1
      `,
    );
    return result.json.results.bindings[0].bech32.value;
  }, firstTurtleText);
  expect(address).toMatch(/^addr1/);

  const resolvedLabel = "Selected library decoded address";
  const overlayTurtle = `
@prefix cardano: <https://lambdasistemi.github.io/cardano-ledger-rdf/vocab/cardano#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix fixture: <https://example.test/cardano-ledger-inspector/fixture#> .

fixture:selectedLibraryAddress
  rdfs:label "${resolvedLabel}" ;
  cardano:bech32 "${address}" .
`;

  await page.getByRole("banner").getByRole("link", { name: "Library" }).click();
  await expect(page).toHaveURL(/\/library$/);

  const library = page.locator(".library-page");
  await library.getByLabel("Book Turtle").fill(overlayTurtle);
  await library.getByRole("button", { name: "Add book" }).click();

  const localBook = library.locator(".library-book", { hasText: "Pasted overlay Turtle" });
  await expect(localBook).toBeVisible();
  await expect(
    localBook.getByRole("checkbox", { name: "Select Pasted overlay Turtle" }),
  ).toBeChecked();

  await openInspectViaShell(page);
  await selectResultTab(page, "Graph / RDF");
  const overlayPanel = page.locator(".overlay-book-panel");
  await overlayPanel.getByRole("button", { name: "Apply selected books" }).click();

  await selectResultTab(page, "Structure");
  await expect(
    page.getByRole("heading", { name: "Identity metadata" }),
  ).toBeVisible();
  const decodedTreePanel = decodedPanel(page);
  await expandDecodedStructure(decodedTreePanel);
  const resolvedAddressRow = decodedTreePanel
    .locator(".decoded-tree-row")
    .filter({ hasText: "Address" })
    .filter({ hasText: resolvedLabel })
    .first();
  await expect(resolvedAddressRow).toContainText(resolvedLabel);
  await expect(page.getByRole("button", { name: "Load Amaru overlay book" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Load SundaeSwap V3 blueprint" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Load Cardano RDF SHACL shapes" })).toHaveCount(0);
});

test("labels decoded-tree nodes into local books and resolves immediately", async ({
  page,
}) => {
  await decodeFixtureAt(page, "/inspect", conwayMainnetFixturePath);

  await selectResultTab(page, "Graph / RDF");
  const graphTurtle = await page.locator(".rdf-panel .rdf-turtle").innerText();
  const output0Subject = await page.evaluate((graph) => {
    const result = globalThis.rdfShapes.query(
      graph,
      `
        PREFIX cardano: <https://lambdasistemi.github.io/cardano-ledger-rdf/vocab/cardano#>
        SELECT ?output WHERE {
          ?transaction a cardano:Transaction ;
            cardano:hasOutput ?output .
          ?output cardano:hasIndex 0 .
        }
        LIMIT 1
      `,
    );
    return result.json.results.bindings[0].output.value;
  }, graphTurtle);
  expect(output0Subject).toMatch(/^urn:cardano:utxo:/);

  await selectResultTab(page, "Structure");
  const decodedTreePanel = decodedPanel(page);
  await expandDecodedStructure(decodedTreePanel);

  const output0Row = decodedTreePanel
    .locator(".decoded-tree-row")
    .filter({ hasText: "Output 0" })
    .first();
  await expect(output0Row).toBeVisible();

  const outputLabel = "Inline annotated fixture output";
  await expect(output0Row).not.toContainText(outputLabel);
  await expect(decodedTreeAnnotationActionLayout(output0Row)).resolves.toEqual({
    headerButtonCount: 1,
    standaloneButtonCount: 0,
  });
  await output0Row
    .getByRole("button", { name: "Label this node" })
    .click();
  await expect(
    output0Row.locator(":scope > .decoded-tree-main > .decoded-tree-annotation-form"),
  ).toBeVisible();
  await expect(output0Row.getByLabel("Label", { exact: true })).toBeVisible();
  await output0Row.getByLabel("Label", { exact: true }).fill(outputLabel);
  await output0Row.getByLabel("Optional type").fill("cardano:TransactionOutput");
  await output0Row.getByRole("radio", { name: "Create new local book" }).check();
  await output0Row.getByLabel("New book name").fill("Inline fixture annotations");
  await output0Row.getByRole("button", { name: "Save label" }).click();

  await expect(output0Row).toHaveClass(/decoded-tree-row--resolved/);
  await expect(output0Row.locator(".decoded-tree-raw-value")).toContainText(output0Subject);
  await expandDecodedStructure(decodedTreePanel);

  const addressRows = decodedTreePanel
    .locator(".decoded-tree-row")
    .filter({ hasText: "Address" });
  await expect(addressRows.first()).toBeVisible();
  expect(await addressRows.count()).toBeGreaterThan(1);

  const firstAddressRow = addressRows.first();
  const rawAddress = await decodedRowText(firstAddressRow);
  expect(rawAddress).toMatch(/^[0-9a-f]+$/);

  const inlineLabel = "Inline annotated fixture address";
  await expect(firstAddressRow).not.toContainText(inlineLabel);
  await expect(firstAddressRow.getByLabel("Label", { exact: true })).toHaveCount(0);
  await expect(firstAddressRow.getByLabel("Optional type")).toHaveCount(0);
  await firstAddressRow
    .getByRole("button", { name: "Label this node" })
    .click();
  await expect(firstAddressRow.getByLabel("Label", { exact: true })).toBeVisible();
  await expect(firstAddressRow.getByLabel("Optional type")).toBeVisible();
  await firstAddressRow.getByLabel("Label", { exact: true }).fill(inlineLabel);
  await firstAddressRow.getByLabel("Optional type").fill("FixtureAddress");
  await firstAddressRow.getByRole("radio", { name: "Append to existing book" }).check();
  await firstAddressRow.getByLabel("Target book").selectOption({
    label: "Inline fixture annotations",
  });
  await firstAddressRow.getByRole("button", { name: "Save label" }).click();

  await expect(firstAddressRow).toContainText(inlineLabel);
  await expandDecodedStructure(decodedTreePanel);

  const datumHashRow = decodedTreePanel
    .locator(".decoded-tree-row")
    .filter({ hasText: "Datum hash" })
    .first();
  const appendedLabel = "Existing-book annotated fixture datum hash";
  await expect(datumHashRow.getByLabel("Label", { exact: true })).toHaveCount(0);
  await datumHashRow
    .getByRole("button", { name: "Label this node" })
    .click();
  await expect(datumHashRow.getByLabel("Label", { exact: true })).toBeVisible();
  await datumHashRow.getByLabel("Label", { exact: true }).fill(appendedLabel);
  await datumHashRow.getByRole("radio", { name: "Append to existing book" }).check();
  await datumHashRow.getByLabel("Target book").selectOption({
    label: "Inline fixture annotations",
  });
  await datumHashRow.getByRole("button", { name: "Save label" }).click();

  await expect(datumHashRow).toContainText(appendedLabel);

  await expandDecodedStructure(decodedTreePanel);
  const verificationKeyRow = decodedTreePanel
    .locator(".decoded-tree-row")
    .filter({ hasText: "Verification key" })
    .first();
  const verificationKeyLabel = "Existing-book annotated verification key";
  await expect(verificationKeyRow).toBeVisible();
  await expect(verificationKeyRow.getByLabel("Label", { exact: true })).toHaveCount(0);
  await verificationKeyRow
    .getByRole("button", { name: "Label this node" })
    .click();
  await expect(verificationKeyRow.getByLabel("Label", { exact: true })).toBeVisible();
  await verificationKeyRow.getByLabel("Label", { exact: true }).fill(verificationKeyLabel);
  await verificationKeyRow.getByRole("radio", { name: "Append to existing book" }).check();
  await verificationKeyRow.getByLabel("Target book").selectOption({
    label: "Inline fixture annotations",
  });
  await verificationKeyRow.getByRole("button", { name: "Save label" }).click();

  await expect(verificationKeyRow).toContainText(verificationKeyLabel);

  const rawStore = await page.evaluate(
    (key) => window.localStorage.getItem(key),
    localBookStoreKey,
  );
  const store = JSON.parse(rawStore);
  const generatedBook = store.books.find(
    (book) => book.name === "Inline fixture annotations",
  );
  expect(generatedBook).toBeTruthy();
  expect(generatedBook.seed).toBe(false);
  expect(generatedBook.selected).toBe(true);
  expect(generatedBook.raw).toContain("@prefix cardano:");
  expect(generatedBook.raw).toContain("@prefix rdfs:");
  expect(generatedBook.raw).toContain("@prefix local:");
  expect(generatedBook.raw).toContain(`<${output0Subject}>`);
  expect(generatedBook.raw).not.toContain("local:annotation-");
  expect(generatedBook.raw).toContain("cardano:bech32");
  expect(generatedBook.raw).toContain("cardano:TransactionOutput");
  expect(generatedBook.raw).toContain(outputLabel);
  expect(generatedBook.raw).toContain(inlineLabel);
  expect(generatedBook.raw).toContain(appendedLabel);
  expect(generatedBook.raw).toContain(verificationKeyLabel);

  await page.getByRole("banner").getByRole("link", { name: "Library" }).click();
  await expect(page).toHaveURL(/\/library$/);
  const [selectedDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export selected books" }).click(),
  ]);
  const selectedPath = await selectedDownload.path();
  expect(selectedPath).not.toBeNull();
  const selectedJson = await readFile(selectedPath, "utf8");

  const browser = page.context().browser();
  expect(browser).not.toBeNull();
  const cleanContext = await browser.newContext();
  try {
    const cleanPage = await cleanContext.newPage();
    await cleanPage.goto("/library");
    await cleanPage.getByLabel("Book store JSON file").setInputFiles({
      name: "generated-annotations.json",
      mimeType: "application/json",
      buffer: Buffer.from(selectedJson),
    });
    await expect(
      cleanPage
        .locator(".library-book", { hasText: "Inline fixture annotations" })
        .getByRole("checkbox", { name: "Select Inline fixture annotations" }),
    ).toBeChecked();

    await decodeFixtureAt(cleanPage, "/inspect", conwayMainnetFixturePath);
    const cleanDecodedPanel = decodedPanel(cleanPage);
    await expandDecodedStructure(cleanDecodedPanel);
    await expect(
      cleanDecodedPanel
        .locator(".decoded-tree-row")
        .filter({ hasText: "Address" })
        .filter({ hasText: inlineLabel })
        .first(),
    ).toContainText(inlineLabel);
  } finally {
    await cleanContext.close();
  }
});

test("selected library blueprint book applies typed RDF fields", async ({
  page,
}) => {
  await page.goto("/library");
  const library = page.locator(".library-page");
  const blueprintBook = library.locator(".library-book", {
    hasText: "SundaeSwap V3 blueprint",
  });
  await expect(blueprintBook).toBeVisible();
  await blueprintBook
    .getByRole("checkbox", { name: "Select SundaeSwap V3 blueprint" })
    .uncheck();

  await decodeFixtureAt(page, "/inspect", signingIntentFixturePath);

  await selectResultTab(page, "Graph / RDF");
  const rdfPanel = page.locator(".rdf-panel");
  const turtle = rdfPanel.locator(".rdf-turtle");
  const typedFieldsPanel = page.locator(".typed-fields-panel");
  await expect(turtle).not.toContainText(":OrderDatum_max_protocol_fee 1280000");
  await expect(
    typedFieldsPanel.getByText("OrderDatum_max_protocol_fee", { exact: true }),
  ).toHaveCount(0);
  await expect(typedFieldsPanel.getByText("1280000", { exact: true })).toHaveCount(0);

  await page.getByRole("banner").getByRole("link", { name: "Library" }).click();
  await blueprintBook
    .getByRole("checkbox", { name: "Select SundaeSwap V3 blueprint" })
    .check();
  await openInspectViaShell(page);
  await selectResultTab(page, "Graph / RDF");
  const overlayPanel = page.locator(".overlay-book-panel");
  await overlayPanel.getByRole("button", { name: "Apply selected books" }).click();

  await expect(turtle).toContainText(":OrderDatum_max_protocol_fee 1280000");
  await expect(
    typedFieldsPanel.getByRole("heading", {
      name: "SPARQL lens: typed contract fields",
    }),
  ).toBeVisible();

  const typedRow = typedFieldsPanel
    .locator(".sparql-lens-row")
    .filter({ hasText: "OrderDatum_max_protocol_fee" })
    .filter({ hasText: "1280000" });
  await expect(typedRow.first()).toBeVisible();

  const turtleText = await turtle.innerText();
  const queryResult = await page.evaluate((graph) => {
    const query = `
      PREFIX : <https://lambdasistemi.github.io/cardano-rdf/fixtures/tx-rdf#>
      SELECT ?subject ?value WHERE {
        ?subject :OrderDatum_max_protocol_fee ?value .
      }
    `;

    return globalThis.rdfShapes.query(graph, query);
  }, turtleText);
  expect(queryResult.kind).toBe("solutions");
  expect(
    queryResult.json.results.bindings.map((binding) => binding.value.value),
  ).toContain("1280000");

  await page.getByRole("banner").getByRole("link", { name: "Library" }).click();
  await blueprintBook
    .getByRole("checkbox", { name: "Select SundaeSwap V3 blueprint" })
    .uncheck();
  await openInspectViaShell(page);
  await selectResultTab(page, "Graph / RDF");
  await overlayPanel.getByRole("button", { name: "Apply selected books" }).click();

  await expect(turtle).not.toContainText(":OrderDatum_max_protocol_fee 1280000");
  await expect(typedRow).toHaveCount(0);
});

test("exposes the vendored RDF query engine", async ({ page }) => {
  await page.goto("/");

  const result = await page.evaluate(() => {
    const graph = `
      @prefix ex: <https://example.test/> .
      ex:tx ex:label "demo transaction" .
    `;
    const query = `
      PREFIX ex: <https://example.test/>
      SELECT ?label WHERE { ex:tx ex:label ?label }
    `;

    return globalThis.rdfShapes.query(graph, query);
  });

  expect(result.kind).toBe("solutions");
  expect(result.json.results.bindings[0].label.value).toBe("demo transaction");
});

test("lists selected library SHACL shapes as selected inspect parts", async ({ page }) => {
  await decodeFixture(page);

  const validateType = await page.evaluate(() => typeof globalThis.rdfShapes.validate);
  expect(validateType).toBe("function");

  await selectResultTab(page, "Graph / RDF");
  const overlayPanel = page.locator(".overlay-book-panel");
  await expect(
    overlayPanel.locator(".book-part-row", {
      hasText: "Cardano transaction SHACL shapes",
    }),
  ).toBeVisible();
  await expect(overlayPanel.getByLabel("Selected overlay Turtle")).not.toHaveValue(/sh:NodeShape/);
});

test("renders selected library SHACL conformance for bundled Cardano RDF shapes", async ({
  page,
}) => {
  await decodeFixture(page);

  await selectResultTab(page, "Validation");
  const conformancePanel = page.locator(".shacl-conformance-panel");
  await expect(
    conformancePanel.getByRole("heading", { name: "RDF SHACL conformance" }),
  ).toBeVisible();
  await expect(conformancePanel.getByText("Cardano transaction SHACL shapes")).toBeVisible();
  await expect(
    conformancePanel
      .locator(".validation-check-row", { hasText: "Author gate" })
      .locator(".validation-status-badge", { hasText: "pass" }),
  ).toBeVisible();
  await expect(
    conformancePanel
      .locator(".validation-check-row", { hasText: "Auditor classifier" })
      .locator(".validation-status-badge", { hasText: "canonical-pipeline match" }),
  ).toBeVisible();
  await expect(conformancePanel.getByText("No phase-1 issues.")).toBeVisible();
});

test("Class A SHACL shapes fire on crafted phase-1 violations", async ({ page }) => {
  const shapes = await readFile(cardanoShaclShapesPath, "utf8");
  const cases = [
    {
      name: "empty input set",
      expected: "InputSetEmptyUTxO",
      fallback: "cardano#hasInput",
      data: classATurtle({ includeInput: false }),
    },
    {
      name: "reference input overlap",
      expected: "ReferenceInputOverlapsWithInput",
      data: classATurtle({
        txPredicates: ["cardano:hasReferenceInput _:referenceInput1"],
        body: `
_:referenceInput1 a cardano:Input ;
  cardano:txOutRef "0000000000000000000000000000000000000000000000000000000000000001#0" .
`,
      }),
    },
    {
      name: "genesis legacy certificate",
      expected: "UnsupportedLegacyCertificate",
      fallback: "GenesisKeyDelegation",
      data: classATurtle({
        txPredicates: ["cardano:hasCertificate _:legacyCert"],
        body: "_:legacyCert a cardano:GenesisKeyDelegation .",
      }),
    },
    {
      name: "MIR legacy certificate",
      expected: "UnsupportedLegacyCertificate",
      fallback: "MIRCertificate",
      data: classATurtle({
        txPredicates: ["cardano:hasCertificate _:mirCert"],
        body: "_:mirCert a cardano:MIRCertificate .",
      }),
    },
    {
      name: "zero treasury withdrawal",
      expected: "TreasuryWithdrawalZero",
      data: classATurtle({
        txPredicates: ["cardano:hasProposal _:proposal1"],
        body: `
_:proposal1 a cardano:Proposal ;
  cardano:hasGovAction _:treasuryAction1 .
_:treasuryAction1 a cardano:TreasuryWithdrawals ;
  cardano:hasWithdrawal _:treasuryWithdrawal1 .
_:treasuryWithdrawal1 a cardano:Withdrawal ;
  cardano:hasLovelace 0 .
`,
      }),
    },
    {
      name: "conflicting committee update",
      expected: "CommitteeUpdateConflict",
      data: classATurtle({
        txPredicates: ["cardano:hasProposal _:proposal1"],
        body: `
_:proposal1 a cardano:Proposal ;
  cardano:hasGovAction _:committeeAction1 .
_:committeeAction1 a cardano:UpdateCommittee ;
  cardano:removesMember <urn:cardano:id:CommitteeColdKey:bad> ;
  cardano:addsMember _:committeeAddition1 .
_:committeeAddition1 a cardano:CommitteeAddition ;
  cardano:hasIdentifier <urn:cardano:id:CommitteeColdKey:bad> .
`,
      }),
    },
    {
      name: "auxiliary data hash missing",
      expected: "AuxiliaryDataHashMissing",
      data: classATurtle({
        txPredicates: ["cardano:hasAuxiliaryData _:auxiliaryData1"],
        body: "_:auxiliaryData1 a cardano:AuxiliaryData .",
      }),
    },
    {
      name: "auxiliary data hash unexpected",
      expected: "AuxiliaryDataHashPresentButNotExpected",
      data: classATurtle({
        txPredicates: [
          "cardano:auxiliaryDataHash <urn:cardano:id:AuxiliaryDataHash:unexpected>",
        ],
      }),
    },
    {
      name: "input canonical order warning",
      expected: "InputsNotCanonicallySorted",
      data: classATurtle({
        txPredicates: ["cardano:hasInput _:input2"],
        body: `
_:input1 cardano:inputOrder 0 .
_:input2 a cardano:Input ;
  cardano:inputOrder 1 ;
  cardano:txOutRef "0000000000000000000000000000000000000000000000000000000000000000#0" .
`,
      }),
    },
    {
      name: "withdrawal canonical order warning",
      expected: "WithdrawalsNotCanonicallySorted",
      data: classATurtle({
        txPredicates: [
          "cardano:hasWithdrawal _:withdrawal1",
          "cardano:hasWithdrawal _:withdrawal2",
        ],
        body: `
_:withdrawal1 a cardano:Withdrawal ;
  cardano:withdrawalOrder 0 ;
  cardano:withdrawalAccount <urn:cardano:id:StakeKey:2> .
_:withdrawal2 a cardano:Withdrawal ;
  cardano:withdrawalOrder 1 ;
  cardano:withdrawalAccount <urn:cardano:id:StakeKey:1> .
`,
      }),
    },
  ];

  await page.goto("/");
  await page.waitForFunction(() => typeof globalThis.txInspectorValidateShacl === "function");

  for (const scenario of cases) {
    const report = await page.evaluate(
      ({ data, shapes }) => globalThis.txInspectorValidateShacl(data, shapes),
      { data: scenario.data, shapes },
    );
    const payload = JSON.stringify(report);
    expect(report.conforms, `${scenario.name} should violate Class A shapes`).toBe(false);
    expect(
      payload.includes(scenario.expected) ||
        (scenario.fallback !== undefined && payload.includes(scenario.fallback)),
      scenario.name,
    ).toBe(true);
  }
});

test("network consistency SHACL shape validates RDF network literals", async ({ page }) => {
  const shapes = await readFile(cardanoShaclShapesPath, "utf8");

  await page.goto("/");
  await page.waitForFunction(() => typeof globalThis.txInspectorValidateShacl === "function");

  const mismatchReport = await page.evaluate(
    ({ data, shapes }) => globalThis.txInspectorValidateShacl(data, shapes),
    { data: networkConsistencyTurtle(0), shapes },
  );
  expect(
    mismatchReport.conforms,
    "body network id 1 with output address network 0 should violate network consistency",
  ).toBe(false);
  expect(JSON.stringify(mismatchReport)).toContain(networkConsistencyMessage);
  expect(JSON.stringify(mismatchReport)).toContain(
    "urn:cardano:address:network-consistency-output",
  );

  const mixedReport = await page.evaluate(
    ({ data, shapes }) => globalThis.txInspectorValidateShacl(data, shapes),
    { data: mixedNetworkTurtle(), shapes },
  );
  expect(
    mixedReport.conforms,
    "network-bearing entities with mixed network literals should violate network consistency",
  ).toBe(false);
  expect(JSON.stringify(mixedReport)).toContain(networkConsistencyMessage);

  const consistentReport = await page.evaluate(
    ({ data, shapes }) => globalThis.txInspectorValidateShacl(data, shapes),
    { data: networkConsistencyTurtle(1), shapes },
  );
  expect(
    consistentReport.violations.some((violation) =>
      violation.message.includes("NetworkConsistency"),
    ),
    "consistent network-bearing nodes should not trigger the network consistency shape",
  ).toBe(false);
  expect(consistentReport.conforms).toBe(true);
});

test("renders network consistency SHACL violations with error location links", async ({
  page,
}) => {
  const shapes = await readFile(cardanoShaclShapesPath, "utf8");

  await decodeFixture(page);
  await selectResultTab(page, "Graph / RDF");

  const turtleText = await page.locator(".rdf-panel .rdf-turtle").innerText();
  const networkAddress = await page.evaluate((graph) => {
    const result = globalThis.rdfShapes.query(
      graph,
      `
        PREFIX cardano: <https://lambdasistemi.github.io/cardano-ledger-rdf/vocab/cardano#>
        SELECT ?transaction ?address ?network WHERE {
          ?transaction a cardano:Transaction ;
            cardano:hasOutput ?output .
          ?output cardano:atAddress ?address .
          ?address cardano:network ?network .
        }
        LIMIT 1
      `,
    );
    const row = result.json.results.bindings[0];
    return {
      transaction: row.transaction.value,
      address: row.address.value,
      network: Number(row.network.value),
    };
  }, turtleText);
  expect(networkAddress.transaction).toMatch(/^[a-z][a-z0-9+.-]*:/i);
  expect(networkAddress.address).toBeTruthy();
  expect([0, 1]).toContain(networkAddress.network);

  const candidateSubject = networkAddress.address.startsWith("_:")
    ? networkAddress.address
    : `<${networkAddress.address}>`;
  const subjectBlocks = turtleText
    .split(/\n(?=\S)/)
    .map((block) => block.trim())
    .filter(Boolean);
  const matchingBlock =
    subjectBlocks.find(
      (block) =>
        block.startsWith(candidateSubject) &&
        new RegExp(`cardano:network\\s+${networkAddress.network}\\b`).test(block),
    ) ||
    subjectBlocks.find(
      (block) =>
        /cardano:(?:Address|bech32)/.test(block) &&
        /cardano:network\s+[01]\b/.test(block),
    );
  expect(matchingBlock).toBeTruthy();

  const addressSubject = matchingBlock.match(/^(\S+)/)?.[1] || candidateSubject;
  const addressNetwork = Number(
    matchingBlock.match(/cardano:network\s+([01])\b/)?.[1] ?? networkAddress.network,
  );
  const oppositeNetwork = addressNetwork === 0 ? 1 : 0;

  const overlayTurtle = `
@prefix cardano: <https://lambdasistemi.github.io/cardano-ledger-rdf/vocab/cardano#> .
@prefix fixture: <https://example.test/cardano-ledger-inspector/network-consistency#> .

${addressSubject}
  cardano:network ${oppositeNetwork} .

<${networkAddress.transaction}>
  cardano:hasOutput fixture:linkableNetworkOutput .

fixture:linkableNetworkOutput
  a cardano:Output ;
  cardano:hasIndex 1000 ;
  cardano:lovelace 1 ;
  cardano:atAddress fixture:linkableNetworkAddress .

fixture:linkableNetworkAddress
  a cardano:Address ;
  cardano:network ${oppositeNetwork} .
`;

  await page.getByRole("banner").getByRole("link", { name: "Library" }).click();
  await expect(page).toHaveURL(/\/library$/);
  const library = page.locator(".library-page");
  await library.getByLabel("Book Turtle").fill(overlayTurtle);
  await library.getByRole("button", { name: "Add book" }).click();
  await expect(
    library.getByRole("heading", { name: "Pasted overlay Turtle" }),
  ).toBeVisible();
  await library.getByLabel("Book Turtle").fill(shapes);
  await library.getByRole("button", { name: "Add book" }).click();
  const canonicalShapesBook = library
    .locator(".library-book", { hasText: "Cardano RDF SHACL shapes" })
    .filter({
      has: page.locator(".library-book-meta", { hasText: "local" }),
    });
  await expect(canonicalShapesBook).toHaveCount(1);
  await expect(
    canonicalShapesBook.getByRole("heading", { name: "Cardano RDF SHACL shapes" }),
  ).toBeVisible();

  await openInspectViaShell(page);
  await selectResultTab(page, "Graph / RDF");
  await page
    .locator(".overlay-book-panel")
    .getByRole("button", { name: "Apply selected books" })
    .click();
  await selectResultTab(page, "Validation");

  const violationRow = page
    .locator(".shacl-violation-row")
    .filter({
      hasText: "NetworkConsistency",
      has: page.locator("a.shacl-location-link"),
    })
    .first();
  await expect(violationRow).toBeVisible();
  await expect(
    violationRow.locator(".validation-status-badge", { hasText: "error" }),
  ).toBeVisible();
  await expect(violationRow).toContainText("cardano:network");
  await expect(violationRow.getByRole("link")).toBeVisible();
});

test("renders non-conforming SHACL violations for pasted shapes", async ({
  page,
}) => {
  await page.goto("/library");
  const library = page.locator(".library-page");
  await library.getByLabel("Book Turtle").fill(violatingShaclShapes);
  await library.getByRole("button", { name: "Add book" }).click();
  await expect(
    library.getByRole("heading", { name: "Pasted SHACL shapes" }),
  ).toBeVisible();

  await decodeFixtureAt(page, "/inspect");

  await selectResultTab(page, "Validation");
  const conformancePanel = page.locator(".shacl-conformance-panel");
  await expect(
    conformancePanel.getByRole("heading", { name: "RDF SHACL conformance" }),
  ).toBeVisible();
  await expect(
    conformancePanel
      .locator(".validation-check-row", { hasText: "Author gate" })
      .locator(".validation-status-badge", { hasText: "fail" }),
  ).toBeVisible();
  await expect(
    conformancePanel
      .locator(".validation-check-row", { hasText: "Auditor classifier" })
      .locator(".validation-status-badge", { hasText: "foreign/off-spec" }),
  ).toBeVisible();

  const violationRow = conformancePanel.locator(".shacl-violation-row").filter({
    hasText: "Transactions must include sentinel off-spec marker.",
  });
  await expect(violationRow).toBeVisible();
  await expect(violationRow.getByText("Focus node", { exact: true })).toBeVisible();
  await expect(violationRow.getByText("Path", { exact: true })).toBeVisible();
  await expect(violationRow.getByText("Source shape", { exact: true })).toBeVisible();
  await expect(
    violationRow.locator(".validation-status-badge", { hasText: "warning" }),
  ).toBeVisible();
  await expect(violationRow.getByRole("link", { name: "Transaction" })).toBeVisible();
  await expect(violationRow).toContainText("requiresSentinel");
  await expect(violationRow).toContainText("RequiresSentinelShape");
});

test("keeps signer-critical intent visible in the first viewport", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await decodeFixture(page, signingIntentFixturePath);

  await selectResultTab(page, "Witness");
  const intentPanel = page.locator(".intent-panel");
  const intentMetric = (label, value) =>
    intentPanel
      .locator(".metric-card", { hasText: label })
      .getByText(value, { exact: true });
  await expect(intentPanel.getByRole("heading", { name: "Signing summary" })).toBeVisible();
  await expect(intentPanel.getByText("Swap ADA<->USDM", { exact: true })).toBeVisible();
  await expect(intentPanel.getByText("Required to pay Antithesis as vendor")).toBeVisible();
  await expect(intentMetric("Signer net ADA", "unknown")).toBeVisible();
  await expect(intentMetric("Missing signers", "2 missing required signers")).toBeVisible();
  await expect(intentMetric("Redeemers", "2 redeemers")).toBeVisible();
  await expect(intentMetric("Withdrawals", "1 withdrawal")).toBeVisible();
  await expect(intentMetric("Mint/burn", "No mint/burn")).toBeVisible();
});

test("shows transaction-derived witness plan values", async ({ page }) => {
  await decodeFixture(page);

  await selectResultTab(page, "Witness");
  const witnessPanel = page.locator(".witness-plan");
  await expect(witnessPanel.getByRole("heading", { name: "Witness plan" })).toBeVisible();
  await expect(witnessPanel.getByText("Transaction-only witness plan")).toBeVisible();
  await expect(witnessPanel.getByText("Present vkey witnesses")).toBeVisible();

  const redeemerRow = page
    .locator(".witness-plan .witness-row")
    .filter({ hasText: "ConwayMinting" })
    .first();
  await redeemerRow.getByRole("button", { name: "Copy" }).click();
  await expect(redeemerRow.getByRole("button", { name: "Copied" })).toBeVisible();

  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toMatch(/^[0-9a-f]{64}$/);
});

test("surfaces ledger validation diagnostics", async ({ page }) => {
  await decodeFixture(page);

  await selectResultTab(page, "Validation");
  const validationPanel = page.locator(".validation-panel");
  await expect(
    validationPanel.getByRole("heading", { name: "Ledger validation" }),
  ).toBeVisible();
  await expect(validationPanel.getByText("Status")).toBeVisible();
  await expect(
    validationPanel
      .locator(".validation-check-row", { hasText: "Status" })
      .locator(".validation-status-badge", { hasText: "incomplete" }),
  ).toBeVisible();
  await expect(
    validationPanel.locator(".validation-section-title", {
      hasText: "Missing context",
    }),
  ).toBeVisible();
  await expect(validationPanel.getByText("Conway ledger validation")).toBeVisible();
  await expect(validationPanel.getByText("needs context")).toBeVisible();
  await expect(validationPanel.getByText("scope ledger")).toHaveCount(0);
  await expect(
    validationPanel.getByText("Ledger validation needs more explicit context"),
  ).toHaveCount(0);
  await expect(
    validationPanel.getByText("Missing source outputs (3)."),
  ).toBeVisible();
  const missingContextSection = validationPanel
    .locator(".validation-section")
    .filter({ hasText: "Missing context" });
  await expect(
    missingContextSection.locator(".validation-check-row").filter({ hasText: "protocol parameters" }),
  ).toHaveCount(0);
  await expect(validationPanel.getByText("koios.tip+cli_protocol_params")).toBeVisible();
  await expect(
    validationPanel
      .locator(".validation-section", { hasText: "Checks" })
      .getByRole("button", { name: "Copy" }),
  ).toHaveCount(0);

  const sourceOutputRow = missingContextSection
    .locator(".validation-check-row")
    .filter({ hasText: "source output" })
    .first();
  await sourceOutputRow.getByRole("button", { name: "Copy" }).click();
  await expect(sourceOutputRow.getByRole("button", { name: "Copied" })).toBeVisible();

  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toMatch(/^[0-9a-f]{64}$/);
});

test("keeps copy controls off non-value missing context rows", async ({ page }) => {
  const txCbor = (await readFile(fixturePath, "utf8")).trim();

  await installClipboardMock(page);
  await page.route("https://api.koios.rest/api/v1/tip", async (route) => {
    await route.abort();
  });
  await page.route("https://api.koios.rest/api/v1/cli_protocol_params", async (route) => {
    await route.abort();
  });

  await page.goto("/");
  await page.getByRole("tab", { name: "Paste CBOR" }).click();
  await page.getByPlaceholder("Paste Conway transaction CBOR hex").fill(txCbor);
  await page.getByRole("button", { name: "Decode" }).click();

  await selectResultTab(page, "Validation");
  const missingContextSection = page
    .locator(".validation-panel .validation-section")
    .filter({ hasText: "Missing context" });
  const protocolParametersRow = missingContextSection
    .locator(".validation-check-row")
    .filter({ hasText: "protocol parameters" })
    .first();
  await expect(protocolParametersRow).toBeVisible();
  await expect(protocolParametersRow.getByRole("button", { name: "Copy" })).toHaveCount(0);

  const sourceOutputRow = missingContextSection
    .locator(".validation-check-row")
    .filter({ hasText: "source output" })
    .first();
  await expect(sourceOutputRow.getByRole("button", { name: "Copy" })).toBeVisible();
});

test("passes producer transaction CBOR into witness planning", async ({
  page,
}) => {
  const txCbor = (await readFile(fixturePath, "utf8")).trim();
  const validationContext = await loadValidationContext();
  let producerCborRequests = 0;
  let utxoRequests = 0;
  let latestBlockRequests = 0;
  let protocolParameterRequests = 0;

  await installClipboardMock(page);
  await page.route("https://cardano-mainnet.blockfrost.io/api/v0/txs/*/cbor", async (route) => {
    producerCborRequests += 1;
    const txHash = route.request().url().match(/\/txs\/([0-9a-f]+)\/cbor/)?.[1];
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ cbor: producerCbor(validationContext, txHash, txCbor) }),
    });
  });
  await page.route("https://cardano-mainnet.blockfrost.io/api/v0/blocks/latest", async (route) => {
    latestBlockRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        slot: Number(validationContext.slot),
        epoch: Number(validationContext.epoch),
      }),
    });
  });
  await page.route(
    "https://cardano-mainnet.blockfrost.io/api/v0/epochs/latest/parameters",
    async (route) => {
      protocolParameterRequests += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          blockfrostParamsFromLedger(validationContext.protocol_parameters),
        ),
      });
    },
  );
  await page.route("https://cardano-mainnet.blockfrost.io/api/v0/txs/*/utxos", async (route) => {
    utxoRequests += 1;
    await route.abort();
  });

  await configureChainData(page, {
    provider: "Blockfrost",
    network: "mainnet",
    blockfrostKey: "mainnet-test-project",
  });
  await openInspectViaShell(page);
  await page.getByRole("tab", { name: "Paste CBOR" }).click();
  await page.getByPlaceholder("Paste Conway transaction CBOR hex").fill(txCbor);
  await page.getByRole("button", { name: "Decode" }).click();

  await selectResultTab(page, "Witness");
  await expect(
    page.getByText("Producer transaction CBOR resolved every visible transaction input"),
  ).toBeVisible();
  await selectResultTab(page, "Validation");
  await expect(
    page
      .locator(".validation-panel .validation-section", { hasText: "Validation summary" })
      .locator(".validation-check-row", { hasText: "Resolved inputs" }),
  ).toBeVisible();
  await selectResultTab(page, "Witness");
  await expect(
    page.locator(".witness-plan .identity-section-title", {
      hasText: "Resolved inputs",
    }),
  ).toBeVisible();
  await selectResultTab(page, "Validation");
  await expect(
    page
      .locator(".validation-panel .validation-section-title", { hasText: "Resolved inputs" })
      .first(),
  ).toBeVisible();
  await expect(
    page
      .locator(".validation-panel .validation-check-row", { hasText: "Status" })
      .locator(".validation-status-badge", { hasText: "valid" }),
  ).toBeVisible();
  expect(producerCborRequests).toBeGreaterThan(0);
  expect(latestBlockRequests).toBe(1);
  expect(protocolParameterRequests).toBe(1);
  expect(utxoRequests).toBe(0);

  await selectResultTab(page, "Witness");
  const resolvedRow = page
    .locator(".witness-plan .witness-row")
    .filter({ hasText: "resolved" })
    .first();
  await resolvedRow.getByRole("button", { name: "Copy" }).click();

  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toMatch(/^[0-9a-f]{64}#[0-9]+$/);
});

test("passes producer transaction CBOR into RDF resolved value flow", async ({
  page,
}) => {
  const txCbor = (await readFile(fixturePath, "utf8")).trim();
  const validationContext = await loadValidationContext();
  let producerCborRequests = 0;
  let utxoRequests = 0;
  let latestBlockRequests = 0;
  let protocolParameterRequests = 0;

  await installClipboardMock(page);
  await page.route("https://cardano-mainnet.blockfrost.io/api/v0/txs/*/cbor", async (route) => {
    producerCborRequests += 1;
    const txHash = route.request().url().match(/\/txs\/([0-9a-f]+)\/cbor/)?.[1];
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ cbor: producerCbor(validationContext, txHash, txCbor) }),
    });
  });
  await page.route("https://cardano-mainnet.blockfrost.io/api/v0/blocks/latest", async (route) => {
    latestBlockRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        slot: Number(validationContext.slot),
        epoch: Number(validationContext.epoch),
      }),
    });
  });
  await page.route(
    "https://cardano-mainnet.blockfrost.io/api/v0/epochs/latest/parameters",
    async (route) => {
      protocolParameterRequests += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          blockfrostParamsFromLedger(validationContext.protocol_parameters),
        ),
      });
    },
  );
  await page.route("https://cardano-mainnet.blockfrost.io/api/v0/txs/*/utxos", async (route) => {
    utxoRequests += 1;
    await route.abort();
  });

  await configureChainData(page, {
    provider: "Blockfrost",
    network: "mainnet",
    blockfrostKey: "mainnet-test-project",
  });
  await openInspectViaShell(page);
  await page.getByRole("tab", { name: "Paste CBOR" }).click();
  await page.getByPlaceholder("Paste Conway transaction CBOR hex").fill(txCbor);
  await page.getByRole("button", { name: "Decode" }).click();

  await selectResultTab(page, "Graph / RDF");
  const turtle = page.locator(".rdf-panel .rdf-turtle");
  await expect(turtle).toContainText("cardano:resolvedTo");
  await expect(turtle).toContainText("resolvedInput");
  expect(producerCborRequests).toBeGreaterThan(0);
  expect(latestBlockRequests).toBe(1);
  expect(protocolParameterRequests).toBe(1);
  expect(utxoRequests).toBe(0);
});

test("surfaces hard provider context resolution failures", async ({
  page,
}) => {
  const txCbor = (await readFile(fixturePath, "utf8")).trim();

  await installClipboardMock(page);
  await page.addInitScript(() => {
    Object.defineProperty(globalThis, "runInspector", {
      configurable: true,
      set(originalRunInspector) {
        Object.defineProperty(globalThis, "runInspector", {
          configurable: true,
          writable: true,
          value: async (stdinText) => {
            const request = JSON.parse(stdinText);
            const result = await originalRunInspector(stdinText);
            if (request && request.op === "tx.inspect") {
              return { ...result, exitOk: true, stdout: "{not-json" };
            }
            return result;
          },
        });
      },
    });
  });

  await configureChainData(page, {
    provider: "Blockfrost",
    network: "mainnet",
    blockfrostKey: "mainnet-test-project",
  });
  await openInspectViaShell(page);
  await page.getByRole("tab", { name: "Paste CBOR" }).click();
  await page.getByPlaceholder("Paste Conway transaction CBOR hex").fill(txCbor);
  await page.getByRole("button", { name: "Decode" }).click();

  await selectResultTab(page, "Validation");
  const providerResolution = page
    .locator(".validation-panel .validation-section")
    .filter({ hasText: "Provider resolution" });
  await expect(providerResolution.getByText("provider error").first()).toBeVisible();
  await expect(providerResolution).toContainText(/provider context|Unexpected token|JSON/);
});

test("uses the same tx CBOR provider boundary for Koios", async ({ page }) => {
  const txCbor = (await readFile(fixturePath, "utf8")).trim();
  const validationContext = await loadValidationContext();
  let koiosCborRequests = 0;
  let koiosTipRequests = 0;
  let koiosPParamRequests = 0;

  await installClipboardMock(page);
  await page.route("https://api.koios.rest/api/v1/tx_cbor", async (route) => {
    koiosCborRequests += 1;
    const requestBody = route.request().postDataJSON();
    expect(requestBody._tx_hashes).toHaveLength(1);
    const txHash = requestBody._tx_hashes[0];
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{ cbor: producerCbor(validationContext, txHash, txCbor) }]),
    });
  });
  await page.route("https://api.koios.rest/api/v1/tip", async (route) => {
    koiosTipRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          abs_slot: Number(validationContext.slot),
          epoch_no: Number(validationContext.epoch),
        },
      ]),
    });
  });
  await page.route("https://api.koios.rest/api/v1/cli_protocol_params", async (route) => {
    koiosPParamRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(validationContext.protocol_parameters),
    });
  });

  await configureChainData(page, {
    provider: "Koios",
    network: "mainnet",
    koiosBearer: "koios-test-token",
  });
  await openInspectViaShell(page);
  await page.getByRole("tab", { name: "Paste CBOR" }).click();
  await page.getByPlaceholder("Paste Conway transaction CBOR hex").fill(txCbor);
  await page.getByRole("button", { name: "Decode" }).click();

  await selectResultTab(page, "Witness");
  await expect(
    page.getByText("Producer transaction CBOR resolved every visible transaction input"),
  ).toBeVisible();
  await selectResultTab(page, "Validation");
  await expect(
    page
      .locator(".validation-panel .validation-section", { hasText: "Validation summary" })
      .locator(".validation-check-row", { hasText: "Resolved inputs" }),
  ).toBeVisible();
  await expect(
    page
      .locator(".validation-panel .validation-check-row", { hasText: "Status" })
      .locator(".validation-status-badge", { hasText: "valid" }),
  ).toBeVisible();
  expect(koiosCborRequests).toBeGreaterThan(0);
  expect(koiosTipRequests).toBe(1);
  expect(koiosPParamRequests).toBe(1);
});

test("routes Blockfrost-shaped keys away from Koios auth", async ({ page }) => {
  await page.goto("/settings");
  await page.getByRole("radio", { name: "Koios" }).check();
  await page.getByPlaceholder("eyJhbGciOi...").fill("mainnet-test-project");

  await expect(page.getByRole("radio", { name: "Blockfrost" })).toBeChecked();
  await expect(page.getByPlaceholder("mainnet... / preprod... / preview...")).toHaveValue(
    "mainnet-test-project",
  );
});

test("opens browser rows in place without losing identity context", async ({
  page,
}) => {
  await decodeFixture(page);

  await selectResultTab(page, "Graph / RDF");
  const inputsRow = page
    .locator(".browser-row")
    .filter({ has: page.locator("code", { hasText: "inputs" }) })
    .first();

  await expect(inputsRow.getByRole("button", { name: "Copy" })).toHaveCount(0);
  await expect(browserRowActionLayout(inputsRow)).resolves.toEqual({
    headerActions: ["Open"],
    standaloneActionCount: 0,
  });
  await inputsRow.locator(".browser-summary").click();
  await expect(inputsRow).toHaveClass(/is-copied/);

  await inputsRow
    .locator(":scope > .browser-row-main > .browser-keyline")
    .getByRole("button", { name: "Open" })
    .click();

  await expect(page.locator(".browser-children").first()).toBeVisible();
  await expect(browserRowActionLayout(inputsRow)).resolves.toEqual({
    headerActions: ["Close"],
    standaloneActionCount: 0,
  });
  await expect(
    page.getByRole("heading", { name: "Identity metadata" }),
  ).toBeVisible();
  await expect(page.locator(".compact-identity-panel .identity-grid")).toBeVisible();
});

test("keeps decoded transaction layout within the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await decodeFixture(page);

  const overflowPx = await page.evaluate(() => {
    const width = window.innerWidth;
    const scrollWidth = Math.max(
      document.documentElement.scrollWidth,
      document.body.scrollWidth,
    );
    return scrollWidth - width;
  });

  expect(overflowPx).toBeLessThanOrEqual(1);

  await expect(decodedStructureIndentationViolations(page)).resolves.toEqual([]);
});

test("keeps responsive inspector states within viewport without tab bar overrun", async ({
  page,
}) => {
  const widths = [390, 680, 768, 900, 1440];
  const resultTabs = ["Structure", "Witness", "Validation", "Graph / RDF"];

  await page.goto("/inspect");
  await expect(page.getByRole("tab", { name: "Paste CBOR" })).toBeVisible();
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await expectDocumentNoHorizontalOverflow(
      page,
      `input screen should not horizontally overflow at ${width}px`,
    );
  }

  await decodeFixtureAt(page, "/inspect");
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    for (const tab of resultTabs) {
      await selectResultTab(page, tab);
      await expectDocumentNoHorizontalOverflow(
        page,
        `${tab} tab should not horizontally overflow at ${width}px`,
      );
      await expectResultTabBarRightEdgeFlush(
        page,
        `${tab} tab bar should be flush at ${width}px`,
      );
    }
  }
});

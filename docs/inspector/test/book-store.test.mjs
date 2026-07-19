import assert from "node:assert/strict";
import test from "node:test";

import { serializeImpl } from "../src/FFI/BookStore.js";

const cardanoPrefix =
  "@prefix cardano: <https://example.com/cardano#> .";
const rdfsPrefix = "@prefix rdfs: <https://example.com/rdfs#> .";
const conflictingCardanoPrefix =
  "@prefix cardano: <https://other.example/cardano#> .";

const repeatedTurtle = [
  "before",
  cardanoPrefix,
  rdfsPrefix,
  "middle",
  cardanoPrefix,
  conflictingCardanoPrefix,
  "after",
].join("\n");

test("serializeImpl deduplicates equivalent prefixes in every Turtle field", () => {
  const store = {
    kind: "cardano-ledger-inspector.books.v1",
    books: [
      {
        id: "book-1",
        name: "Book",
        source: "local",
        raw: repeatedTurtle,
        turtle: repeatedTurtle,
        selected: true,
        seed: false,
        parts: [
          {
            id: "part-1",
            label: "Part",
            kind: "annotation",
            turtle: repeatedTurtle,
            plutusJson: "{}",
          },
        ],
      },
    ],
  };
  const original = structuredClone(store);

  const serialized = JSON.parse(serializeImpl(store));
  const fields = [
    serialized.books[0].raw,
    serialized.books[0].turtle,
    serialized.books[0].parts[0].turtle,
  ];

  for (const turtle of fields) {
    assert.equal(turtle.match(/^@prefix cardano:/gm).length, 2);
    assert.equal(turtle.match(/^@prefix rdfs:/gm).length, 1);
    assert.deepEqual(turtle.split("\n").filter((line) => line === "before" || line === "middle" || line === "after"), [
      "before",
      "middle",
      "after",
    ]);
    assert.ok(turtle.indexOf(cardanoPrefix) < turtle.indexOf(rdfsPrefix));
    assert.ok(turtle.indexOf(rdfsPrefix) < turtle.indexOf(conflictingCardanoPrefix));
  }

  assert.deepEqual(store, original);
});

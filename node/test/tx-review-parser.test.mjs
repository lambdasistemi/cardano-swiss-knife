import assert from "node:assert/strict";
import test from "node:test";

import * as Json from "../../docs/inspector/src/FFI/Json.js";

const sampleEnvelope = JSON.stringify({
  ledger_functional_layer: "cardano-ledger-functional/v1",
  op: "tx.review",
  result: {
    review: {
      version: "cardano-tx-review/v1",
      tx_id: "a213c84030a6ae1c05c9443b07d1b853b48637d769eec188af9ff3258b0713b1",
      body_hash: "a213c84030a6ae1c05c9443b07d1b853b48637d769eec188af9ff3258b0713b1",
      fee: { lovelace: "1527153" },
      context: {
        input_status: "incomplete",
        regular_input_count: 5,
        resolved_regular_input_count: 0,
        missing_regular_input_count: 5,
      },
      net_signer_value: {
        provable: false,
        lovelace: null,
        note: "missing input context, net signer gain/loss unprovable",
      },
      warnings: ["Declared required signer hashes are absent from the witness set."],
      control_groups: [
        {
          category: "signer_controlled",
          role: "signer_change",
          role_provenance: "heuristic",
          evidence: ["ledger_proven", "heuristic"],
          lovelace: "75884469",
          asset_class_count: 0,
          output_count: 1,
          output_indices: [1],
          addresses: ["018bd03209d227956aaf9670751e0aa2057b51c1537a43f155b24fb1c14c7889c658ef4f491a34cf79c35a2e0fe6b0d1b0a856fb9580f2d9c3"],
          assets: {},
        },
        {
          category: "script",
          role: "script_lock",
          role_provenance: "ledger_proven",
          evidence: ["ledger_proven"],
          lovelace: "611069353175",
          asset_class_count: 1,
          output_count: 1,
          output_indices: [0],
          addresses: ["3132201dc1e82708364c6c42a53f89f675314bb9ad5da2734aa10baa0d32201dc1e82708364c6c42a53f89f675314bb9ad5da2734aa10baa0d"],
          assets: { "8bd03209d227956aaf9670751e0aa2057b51c1537a43f155b24fb1c1": { "414d415255": "500000000" } },
        },
      ],
      high_value_movements: [
        {
          category: "script",
          role: "script_lock",
          role_provenance: "ledger_proven",
          evidence: ["ledger_proven"],
          lovelace: "611069353175",
          asset_class_count: 1,
          output_count: 1,
          output_indices: [0],
          addresses: ["3132201dc1e82708364c6c42a53f89f675314bb9ad5da2734aa10baa0d32201dc1e82708364c6c42a53f89f675314bb9ad5da2734aa10baa0d"],
          assets: { "8bd03209d227956aaf9670751e0aa2057b51c1537a43f155b24fb1c1": { "414d415255": "500000000" } },
        },
      ],
      sources: [
        { kind: "regular_input", count: 5, resolved_count: 0, missing_count: 5, resolved_lovelace: "0" },
        { kind: "withdrawal", count: 1, lovelace: "0" },
        { kind: "collateral", conditional: true, input_count: 1, body_total_lovelace: "2290730", return_lovelace: "75120892" },
        { kind: "reference_input", count: 2, read_only: true },
      ],
      collateral: {
        conditional: true,
        input_count: 1,
        body_total_lovelace: "2290730",
        return_lovelace: "75120892",
      },
      claims: [
        {
          label: "reorganize",
          value: "Treasury reorganize: merge UTxOs into one continuing output",
          detail: "Routine treasury maintenance",
          self_declared: true,
        },
      ],
    },
  },
});

test("operationTransactionReviewImpl is exported as a function", () => {
  assert.equal(
    typeof Json.operationTransactionReviewImpl,
    "function",
    "FFI/Json.js must export operationTransactionReviewImpl",
  );
});

test("parses envelope.result.review into a valid typed TransactionReview", () => {
  const review = Json.operationTransactionReviewImpl(sampleEnvelope);
  assert.equal(review.valid, true, "a well-formed envelope must parse as valid");
  assert.equal(review.title, "Transaction review");
  assert.ok(review.subtitle.length > 0, "subtitle must be non-empty");
});

test("preserves top-level review fields from cli/tx-review.mjs", () => {
  const review = Json.operationTransactionReviewImpl(sampleEnvelope);
  assert.equal(review.version, "cardano-tx-review/v1");
  assert.equal(review.txId, "a213c84030a6ae1c05c9443b07d1b853b48637d769eec188af9ff3258b0713b1");
  assert.equal(review.bodyHash, "a213c84030a6ae1c05c9443b07d1b853b48637d769eec188af9ff3258b0713b1");
  assert.equal(review.feeLovelace, "1527153");
  assert.equal(review.inputStatus, "incomplete");
  assert.equal(review.regularInputCount, "5");
  assert.equal(review.resolvedRegularInputCount, "0");
  assert.equal(review.missingRegularInputCount, "5");
  assert.equal(review.netSignerValueProvable, false);
  assert.equal(review.netSignerValueLovelace, "");
  assert.equal(review.netSignerValueNote, "missing input context, net signer gain/loss unprovable");
  assert.deepEqual(review.warnings, ["Declared required signer hashes are absent from the witness set."]);
});

test("preserves control_groups with per-group category, role, role_provenance, evidence, lovelace, asset_class_count, output_count, output_indices, addresses, assets", () => {
  const review = Json.operationTransactionReviewImpl(sampleEnvelope);
  assert.equal(review.controlGroups.length, 2);

  const signer = review.controlGroups[0];
  assert.equal(signer.category, "signer_controlled");
  assert.equal(signer.role, "signer_change");
  assert.equal(signer.roleProvenance, "heuristic");
  assert.deepEqual(signer.evidence, ["ledger_proven", "heuristic"]);
  assert.equal(signer.lovelace, "75884469");
  assert.equal(signer.assetClassCount, "0");
  assert.equal(signer.outputCount, "1");
  assert.deepEqual(signer.outputIndices, ["1"]);
  assert.deepEqual(signer.addresses, ["018bd03209d227956aaf9670751e0aa2057b51c1537a43f155b24fb1c14c7889c658ef4f491a34cf79c35a2e0fe6b0d1b0a856fb9580f2d9c3"]);

  const script = review.controlGroups[1];
  assert.equal(script.category, "script");
  assert.equal(script.role, "script_lock");
  assert.equal(script.roleProvenance, "ledger_proven");
  assert.deepEqual(script.evidence, ["ledger_proven"]);
  assert.equal(script.lovelace, "611069353175");
  assert.equal(script.assetClassCount, "1");
  assert.equal(script.outputCount, "1");
  assert.deepEqual(script.outputIndices, ["0"]);
  assert.deepEqual(script.addresses, ["3132201dc1e82708364c6c42a53f89f675314bb9ad5da2734aa10baa0d32201dc1e82708364c6c42a53f89f675314bb9ad5da2734aa10baa0d"]);
  assert.ok(script.assets.length > 0, "script group must carry its assets");
  assert.equal(script.assets[0].policyId, "8bd03209d227956aaf9670751e0aa2057b51c1537a43f155b24fb1c1");
  assert.equal(script.assets[0].assetName, "414d415255");
  assert.equal(script.assets[0].quantity, "500000000");
});

test("preserves high_value_movements with the same per-group shape", () => {
  const review = Json.operationTransactionReviewImpl(sampleEnvelope);
  assert.equal(review.highValueMovements.length, 1);
  const movement = review.highValueMovements[0];
  assert.equal(movement.category, "script");
  assert.equal(movement.role, "script_lock");
  assert.equal(movement.lovelace, "611069353175");
});

test("preserves claims with label, value, detail, self_declared", () => {
  const review = Json.operationTransactionReviewImpl(sampleEnvelope);
  assert.equal(review.claims.length, 1);
  assert.equal(review.claims[0].label, "reorganize");
  assert.equal(review.claims[0].value, "Treasury reorganize: merge UTxOs into one continuing output");
  assert.equal(review.claims[0].detail, "Routine treasury maintenance");
  assert.equal(review.claims[0].selfDeclared, true);
});

test("preserves collateral fields", () => {
  const review = Json.operationTransactionReviewImpl(sampleEnvelope);
  assert.equal(review.collateralConditional, true);
  assert.equal(review.collateralInputCount, "1");
  assert.equal(review.collateralBodyTotalLovelace, "2290730");
  assert.equal(review.collateralReturnLovelace, "75120892");
});

test("preserves sources with all CLI-consumed per-kind fields", () => {
  const review = Json.operationTransactionReviewImpl(sampleEnvelope);
  assert.equal(review.sources.length, 4);

  const regular = review.sources[0];
  assert.equal(regular.kind, "regular_input");
  assert.equal(regular.count, "5");
  assert.equal(regular.resolvedCount, "0");
  assert.equal(regular.missingCount, "5");
  assert.equal(regular.resolvedLovelace, "0");

  const withdrawal = review.sources[1];
  assert.equal(withdrawal.kind, "withdrawal");
  assert.equal(withdrawal.count, "1");
  assert.equal(withdrawal.lovelace, "0");

  const collateralSource = review.sources[2];
  assert.equal(collateralSource.kind, "collateral");
  assert.equal(collateralSource.conditional, "true");
  assert.equal(collateralSource.inputCount, "1");
  assert.equal(collateralSource.bodyTotalLovelace, "2290730");
  assert.equal(collateralSource.returnLovelace, "75120892");

  const refInput = review.sources[3];
  assert.equal(refInput.kind, "reference_input");
  assert.equal(refInput.count, "2");
  assert.equal(refInput.readOnly, "true");
});

test("malformed JSON produces an invalid result, not a crash", () => {
  const review = Json.operationTransactionReviewImpl("not json at all");
  assert.equal(review.valid, false);
});

test("missing result.review produces an invalid result", () => {
  const review = Json.operationTransactionReviewImpl(JSON.stringify({ result: {} }));
  assert.equal(review.valid, false);
});

test("unmapped top-level review keys survive into additionalFields", () => {
  const envelope = JSON.stringify({
    result: {
      review: {
        version: "cardano-tx-review/v1",
        tx_id: "ab",
        body_hash: "cd",
        fee: { lovelace: "0" },
        context: {},
        net_signer_value: {},
        warnings: [],
        control_groups: [],
        high_value_movements: [],
        sources: [],
        collateral: {},
        claims: [],
        future_field: { detail: "inspector added this later", count: 3 },
      },
    },
  });
  const review = Json.operationTransactionReviewImpl(envelope);
  assert.equal(review.valid, true);
  assert.equal(review.additionalFields.length, 1);
  assert.equal(review.additionalFields[0].key, "future_field");
  assert.equal(review.additionalFields[0].value, JSON.stringify({ detail: "inspector added this later", count: 3 }));
});

test("known review keys do not leak into additionalFields", () => {
  const review = Json.operationTransactionReviewImpl(sampleEnvelope);
  assert.equal(review.additionalFields.length, 0, "the sample envelope has only known keys");
});

import assert from "node:assert/strict";
import test from "node:test";
import { renderTransactionReview } from "../../cli/tx-review.mjs";

test("renders the decision view header line rather than the raw canonical envelope", () => {
  const envelope = {
    ledger_functional_layer: "cardano-ledger-functional/v1",
    op: "tx.review",
    result: {
      review: {
        version: "cardano-tx-review/v1",
        tx_id: "a213c84030a6ae1c05c9443b07d1b853b48637d769eec188af9ff3258b0713b1",
        body_hash: "a213c84030a6ae1c05c9443b07d1b853b48637d769eec188af9ff3258b0713b1",
        fee: { lovelace: "1527153" },
      },
    },
  };
  const firstLine = renderTransactionReview(envelope).split("\n")[0];
  assert.equal(firstLine, "csk tx review — cardano-tx-review/v1");
});

test("T011 (FR-002): renders all five control categories as distinct rows with their own role, provenance, evidence and exact lovelace", () => {
  const review = {
    version: "cardano-tx-review/v1",
    tx_id: "a213c84030a6ae1c05c9443b07d1b853b48637d769eec188af9ff3258b0713b1",
    body_hash: "a213c84030a6ae1c05c9443b07d1b853b48637d769eec188af9ff3258b0713b1",
    fee: { lovelace: "1527153" },
    context: { input_status: "incomplete", regular_input_count: 5, resolved_regular_input_count: 0, missing_regular_input_count: 5 },
    net_signer_value: { provable: false, lovelace: null, note: "missing input context, net signer gain/loss unprovable" },
    warnings: [],
    control_groups: [
      { category: "signer_controlled", role: "signer_change", role_provenance: "heuristic", evidence: ["ledger_proven", "heuristic"], lovelace: "75884469", asset_class_count: 0, output_count: 1, output_indices: [1], addresses: ["018bd03209d227956aaf9670751e0aa2057b51c1537a43f155b24fb1c14c7889c658ef4f491a34cf79c35a2e0fe6b0d1b0a856fb9580f2d9c3"] },
      { category: "external_key", role: "external_key_value", role_provenance: "ledger_proven", evidence: ["ledger_proven"], lovelace: "5000000", asset_class_count: 0, output_count: 1, output_indices: [2], addresses: ["610340b4a8592836dab8a26e02e22812f71521b67f39293ac1a3d4699a4c8d2e1f"] },
      { category: "script", role: "script_lock", role_provenance: "ledger_proven", evidence: ["ledger_proven"], lovelace: "611069353175", asset_class_count: 1, output_count: 1, output_indices: [0], addresses: ["3132201dc1e82708364c6c42a53f89f675314bb9ad5da2734aa10baa0d32201dc1e82708364c6c42a53f89f675314bb9ad5da2734aa10baa0d"], assets: { "8bd03209d227956aaf9670751e0aa2057b51c1537a43f155b24fb1c1": { "414d415255": "500000000" } } },
      { category: "bootstrap", role: "bootstrap_era", role_provenance: "ledger_proven", evidence: ["context_proven"], lovelace: "1234567", asset_class_count: 0, output_count: 1, output_indices: [3], addresses: ["02038b77a93f33a415154b41f3e47a4239a4a51b8b29a26f4a5a43a5b6c7d8e9f0"], assets: {} },
      { category: "unknown", role: "unclassified", role_provenance: "heuristic", evidence: ["heuristic"], lovelace: "999999999", asset_class_count: 2, output_count: 1, output_indices: [4], addresses: ["03a9f0b62d2a63716b04a09f16b0a0e14a0f9e0c0a6d0e2b7a7f6e5d4c3b2a1908"], assets: { "c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8": { "54455354": "100", "": "200" } } },
    ],
    high_value_movements: [],
    sources: [],
    collateral: { conditional: true, input_count: 1, body_total_lovelace: "2290730", return_lovelace: "75120892" },
    claims: [],
  };
  const output = renderTransactionReview({ ledger_functional_layer: "cardano-ledger-functional/v1", op: "tx.review", result: { review } });
  assert.match(output, /^Output control groups \(5\)$/m);
  const categories = ["signer_controlled", "external_key", "script", "bootstrap", "unknown"];
  const positions = categories.map((category) => output.search(new RegExp(`^ {4}category[ \t]+${category}$`, "m")));
  for (const [index, position] of positions.entries()) {
    assert.notEqual(position, -1, `${categories[index]} must render as its own category row, never merged into a coarser split`);
  }
  assert.ok(positions.every((position, index) => index === 0 || positions[index - 1] < position), "the five category rows must appear in envelope order with no two collapsed into a shared bucket");
  const markers = categories.map((category, index) => output.indexOf(`group ${index + 1} of 5`));
  for (const [index, marker] of markers.entries()) assert.notEqual(marker, -1, `group ${index + 1} of 5 must be present`);
  const lastMarker = markers[markers.length - 1];
  const nextHeading = output.slice(lastMarker).search(/\n\S/);
  const groupsEnd = nextHeading === -1 ? output.length : lastMarker + nextHeading + 1;
  const bounds = [...markers.slice(1), groupsEnd];
  const blocks = markers.map((start, index) => output.slice(start, bounds[index]));
  const expected = [
    { category: "signer_controlled", role: "signer_change", provenance: "heuristic", evidence: "ledger_proven, heuristic", lovelace: "75884469" },
    { category: "external_key", role: "external_key_value", provenance: "ledger_proven", evidence: "ledger_proven", lovelace: "5000000" },
    { category: "script", role: "script_lock", provenance: "ledger_proven", evidence: "ledger_proven", lovelace: "611069353175" },
    { category: "bootstrap", role: "bootstrap_era", provenance: "ledger_proven", evidence: "context_proven", lovelace: "1234567" },
    { category: "unknown", role: "unclassified", provenance: "heuristic", evidence: "heuristic", lovelace: "999999999" },
  ];
  for (const [index, group] of expected.entries()) {
    const block = blocks[index];
    assert.match(block, new RegExp(`^ {4}category[ \t]+${group.category}$`, "m"), `${group.category} must render inside its own group block`);
    assert.match(block, new RegExp(`^ {4}role[ \t]+${group.role}$`, "m"), `${group.category} block must carry its own role ${group.role}, never a mispaired one`);
    assert.match(block, new RegExp(`^ {4}role provenance[ \t]+${group.provenance}$`, "m"), `${group.category} block must carry its own role provenance`);
    assert.match(block, new RegExp(`^ {4}evidence[ \t]+${group.evidence}$`, "m"), `${group.category} block must carry its own full evidence list`);
    assert.match(block, new RegExp(`^ {4}lovelace[ \t]+${group.lovelace}$`, "m"), `${group.category} block must carry its own exact lovelace`);
  }
});

test("T012, T022 (FR-004, ruling A-001): signer change, external key value and script lock stay three unambiguous rows with exact lovelace and exact per-asset amounts, and the asset column reads as a class count, never an amount", () => {
  const review = {
    version: "cardano-tx-review/v1",
    tx_id: "a213c84030a6ae1c05c9443b07d1b853b48637d769eec188af9ff3258b0713b1",
    body_hash: "a213c84030a6ae1c05c9443b07d1b853b48637d769eec188af9ff3258b0713b1",
    fee: { lovelace: "170000" },
    context: { input_status: "complete", regular_input_count: 2, resolved_regular_input_count: 2, missing_regular_input_count: 0 },
    net_signer_value: { provable: true, lovelace: "-7000000", note: "signer net flow proven from resolved inputs" },
    warnings: [],
    control_groups: [
      { category: "signer_controlled", role: "signer_change", role_provenance: "heuristic", evidence: ["ledger_proven", "heuristic"], lovelace: "75884469", asset_class_count: 0, output_count: 1, output_indices: [1], addresses: ["018bd03209d227956aaf9670751e0aa2057b51c1537a43f155b24fb1c14c7889c658ef4f491a34cf79c35a2e0fe6b0d1b0a856fb9580f2d9c3"], assets: {} },
      { category: "external_key", role: "external_key_value", role_provenance: "ledger_proven", evidence: ["ledger_proven"], lovelace: "5000000", asset_class_count: 0, output_count: 1, output_indices: [2], addresses: ["610340b4a8592836dab8a26e02e22812f71521b67f39293ac1a3d4699a4c8d2e1f"], assets: {} },
      { category: "script", role: "script_lock", role_provenance: "ledger_proven", evidence: ["ledger_proven"], lovelace: "611069353175", asset_class_count: 3, output_count: 1, output_indices: [0], addresses: ["3132201dc1e82708364c6c42a53f89f675314bb9ad5da2734aa10baa0d32201dc1e82708364c6c42a53f89f675314bb9ad5da2734aa10baa0d"], assets: { f43a62fdc3965df486de8a0d32fe800963589c41b38946602a8b0a45: { "41474958": "999999999", "": "1" }, a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7: { "544f4b454e": "42000000" } } },
      { category: "bootstrap", role: "bootstrap_era", role_provenance: "ledger_proven", evidence: ["context_proven"], lovelace: "1234567", asset_class_count: 0, output_count: 1, output_indices: [3], addresses: ["02038b77a93f33a415154b41f3e47a4239a4a51b8b29a26f4a5a43a5b6c7d8e9f0"] },
    ],
    high_value_movements: [],
    sources: [],
    collateral: { conditional: false, input_count: 0, body_total_lovelace: "0", return_lovelace: null },
    claims: [],
  };
  const output = renderTransactionReview({ ledger_functional_layer: "cardano-ledger-functional/v1", op: "tx.review", result: { review } });
  assert.match(output, /^Output control groups \(4\)$/m);
  const rows = [
    { category: "signer_controlled", role: "signer_change", lovelace: "75884469", assetClasses: "0" },
    { category: "external_key", role: "external_key_value", lovelace: "5000000", assetClasses: "0" },
    { category: "script", role: "script_lock", lovelace: "611069353175", assetClasses: "3" },
    { category: "bootstrap", role: "bootstrap_era", lovelace: "1234567", assetClasses: "0" },
  ];
  const markers = rows.map((row, index) => output.indexOf(`group ${index + 1} of 4`));
  for (const [index, marker] of markers.entries()) assert.notEqual(marker, -1, `group ${index + 1} of 4 must be present`);
  const lastMarker = markers[markers.length - 1];
  const nextHeading = output.slice(lastMarker).search(/\n\S/);
  const groupsEnd = nextHeading === -1 ? output.length : lastMarker + nextHeading + 1;
  const bounds = [...markers.slice(1), groupsEnd];
  const blocks = markers.map((start, index) => output.slice(start, bounds[index]));
  for (const [index, row] of rows.entries()) {
    const block = blocks[index];
    assert.match(block, new RegExp(`^ {4}category[ \t]+${row.category}$`, "m"), `${row.category} must render as its own unambiguous row`);
    assert.match(block, new RegExp(`^ {4}role[ \t]+${row.role}$`, "m"), `${row.category} block must carry its own role`);
    assert.match(block, new RegExp(`^ {4}lovelace[ \t]+${row.lovelace}$`, "m"), `${row.category} block must carry its own exact lovelace`);
    assert.match(block, new RegExp(`^ {4}distinct non-ADA asset classes[ \t]+${row.assetClasses}$`, "m"), `${row.category} block must label its asset column as a count of distinct non-ADA asset classes`);
  }
  const scriptBlock = blocks[2];
  assert.match(scriptBlock, /^ {4}assets$/m, "the script group must carry an assets header");
  assert.match(scriptBlock, /^ {6}a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7\/544f4b454e[ \t]+42000000$/m, "exact policy id, exact asset name, exact decimal quantity for the first sorted asset");
  assert.match(scriptBlock, /^ {6}f43a62fdc3965df486de8a0d32fe800963589c41b38946602a8b0a45\/\(empty asset name\)[ \t]+1$/m, "empty asset name key renders as a readable non-blank label with its exact quantity");
  assert.match(scriptBlock, /^ {6}f43a62fdc3965df486de8a0d32fe800963589c41b38946602a8b0a45\/41474958[ \t]+999999999$/m, "exact policy id, exact asset name, exact decimal quantity for the third sorted asset");
  const assetLines = scriptBlock.split("\n").filter((line) => /^ {6}\S/.test(line) && !line.startsWith("      3132201d"));
  const assetRows = assetLines.filter((line) => line.includes("/"));
  assert.equal(assetRows.length, 3, "exactly three per-asset rows in the multi-class script group");
  const firstPolicy = assetRows[0].indexOf("a0b1c2d3");
  const secondPolicy = assetRows[1].indexOf("f43a62fd");
  const thirdPolicy = assetRows[2].indexOf("f43a62fd");
  assert.ok(firstPolicy !== -1 && secondPolicy !== -1 && thirdPolicy !== -1, "all three asset rows carry their exact policy id");
  assert.ok(assetRows[1].includes("(empty asset name)") && assetRows[2].includes("41474958"), "within one policy the empty asset name sorts before the hex-named asset");
  assert.doesNotMatch(blocks[0], /^ {4}assets$/m, "the asset-free signer_controlled group must not render an assets header");
  assert.doesNotMatch(blocks[1], /^ {4}assets$/m, "the asset-free external_key group must not render an assets header");
  assert.doesNotMatch(blocks[3], /^ {4}assets$/m, "a group whose assets key is absent entirely (non-conforming producer) must not crash or emit an assets header");
  assert.doesNotMatch(output, /asset amount/i, "the asset column must never read as an amount");
  assert.doesNotMatch(output, /asset value/i, "the asset column must never read as a value");
  assert.doesNotMatch(output, /^ {4}assets[ \t]+\d/m, "the class count row must never be labelled just 'assets' with a bare number");
  assert.doesNotMatch(output, /\bworth\b/i, "the asset column must never read as worth");
  assert.doesNotMatch(output, /distinct non-ADA asset classes[ \t]+\d+[ \t]+lovelace/, "the class count must never carry a lovelace unit");
});

test("T013 (FR-005): input status, net signer value and every warning render plainly, with no synthesised readiness enum", () => {
  const review = {
    version: "cardano-tx-review/v1",
    tx_id: "a213c84030a6ae1c05c9443b07d1b853b48637d769eec188af9ff3258b0713b1",
    body_hash: "a213c84030a6ae1c05c9443b07d1b853b48637d769eec188af9ff3258b0713b1",
    fee: { lovelace: "1527153" },
    context: { input_status: "incomplete", regular_input_count: 11, resolved_regular_input_count: 0, missing_regular_input_count: 11 },
    net_signer_value: { provable: false, lovelace: null, note: "missing input context, net signer gain/loss unprovable" },
    warnings: [
      "Metadata describes intent but is self-declared; verify it against the destination addresses and contract policy.",
      "Declared required signer hashes are absent from the witness set.",
    ],
    control_groups: [],
    high_value_movements: [],
    sources: [],
    collateral: { conditional: true, input_count: 1, body_total_lovelace: "2290730", return_lovelace: "75120892" },
    claims: [],
  };
  const output = renderTransactionReview({ ledger_functional_layer: "cardano-ledger-functional/v1", op: "tx.review", result: { review } });
  assert.match(output, /^What is not proven$/m);
  assert.match(output, /^ {2}input context status[ \t]+incomplete$/m, "context.input_status renders plainly, exactly as reported");
  assert.match(output, /^ {2}net signer value provable[ \t]+no$/m);
  assert.match(output, /^ {2}net signer value lovelace[ \t]+\(not reported\)$/m);
  assert.match(output, /^ {2}net signer value note[ \t]+missing input context, net signer gain\/loss unprovable$/m);
  assert.match(output, /^Warnings \(2\)$/m);
  assert.match(output, /^ {2}Metadata describes intent but is self-declared; verify it against the destination addresses and contract policy\.$/m, "the first warning renders verbatim");
  assert.match(output, /^ {2}Declared required signer hashes are absent from the witness set\.$/m, "the second warning renders verbatim, proving every entry renders");
  for (const token of ["ready_for_witnesses", "fully_valid", "readiness", "overall status", "traffic light", "verdict"]) {
    assert.doesNotMatch(output, new RegExp(token, "i"), `no synthesised readiness vocabulary: ${token}`);
  }
  assert.doesNotMatch(output, /\bblocked\b|\brejected\b|\bready\b/i, "no readiness enum word anywhere in the output");
  assert.doesNotMatch(output, /^ {0,2}status[ \t]/m, "incomplete appears only as the reported input context status value, never as a synthesised overall status line");
});

test("T014 (FR-010): an unrecognised top-level review field survives verbatim in the trailing Additional inspector fields section", () => {
  const review = {
    version: "cardano-tx-review/v1",
    tx_id: "e1e2e3e4e5e6e7e8e9e0e1e2e3e4e5e6e7e8e9e0e1e2e3e4e5e6e7e8e9e0e1e2",
    body_hash: "f1f2f3f4f5f6f7f8f9f0f1f2f3f4f5f6f7f8f9f0f1f2f3f4f5f6f7f8f9f0f1f2",
    fee: { lovelace: "160000" },
    context: { input_status: "complete", regular_input_count: 1, resolved_regular_input_count: 1, missing_regular_input_count: 0 },
    net_signer_value: { provable: true, lovelace: "0", note: "no net change" },
    warnings: [],
    control_groups: [],
    high_value_movements: [],
    sources: [],
    collateral: { conditional: false, input_count: 0, body_total_lovelace: "0", return_lovelace: null },
    claims: [],
    future_field: { detail: "inspector added this later", count: 3 },
  };
  const output = renderTransactionReview({ ledger_functional_layer: "cardano-ledger-functional/v1", op: "tx.review", result: { review } });
  assert.match(output, /^Additional inspector fields$/m);
  assert.match(output, /^ {2}future_field:$/m);
  assert.ok(output.includes("    {\n      \"detail\": \"inspector added this later\",\n      \"count\": 3\n    }"), "the unrecognised field value renders verbatim as JSON indented two spaces under its key");
  assert.ok(output.indexOf("Additional inspector fields") > output.indexOf("Claims ("), "the unrecognised-field section is trailing, after the named sections");
  assert.doesNotMatch(output, /^ {2}tx_id:/m, "schema-known fields are not redumped into the additional section");
});

test("T015 (FR-001, FR-003): two renders of one result are byte-equal, with no digit grouping, locale formatting or float artefact", () => {
  const scriptGroup = { category: "script", role: "script_lock", role_provenance: "ledger_proven", evidence: ["ledger_proven"], lovelace: "611069353175", asset_class_count: 1, output_count: 1, output_indices: [0], addresses: ["3132201dc1e82708364c6c42a53f89f675314bb9ad5da2734aa10baa0d32201dc1e82708364c6c42a53f89f675314bb9ad5da2734aa10baa0d"], assets: { "8bd03209d227956aaf9670751e0aa2057b51c1537a43f155b24fb1c1": { "414d415255": "500000000" } } };
  const review = {
    version: "cardano-tx-review/v1",
    tx_id: "a213c84030a6ae1c05c9443b07d1b853b48637d769eec188af9ff3258b0713b1",
    body_hash: "a213c84030a6ae1c05c9443b07d1b853b48637d769eec188af9ff3258b0713b1",
    fee: { lovelace: "1527153" },
    context: { input_status: "incomplete", regular_input_count: 11, resolved_regular_input_count: 0, missing_regular_input_count: 11 },
    net_signer_value: { provable: false, lovelace: null, note: "missing input context, net signer gain/loss unprovable" },
    warnings: ["Declared required signer hashes are absent from the witness set."],
    control_groups: [
      scriptGroup,
      { category: "signer_controlled", role: "signer_change", role_provenance: "heuristic", evidence: ["ledger_proven", "heuristic"], lovelace: "75884469", asset_class_count: 0, output_count: 1, output_indices: [1], addresses: ["018bd03209d227956aaf9670751e0aa2057b51c1537a43f155b24fb1c14c7889c658ef4f491a34cf79c35a2e0fe6b0d1b0a856fb9580f2d9c3"] },
    ],
    high_value_movements: [scriptGroup],
    sources: [
      { kind: "regular_input", count: 11, resolved_count: 0, missing_count: 11, resolved_lovelace: "0" },
      { kind: "withdrawal", count: 1, lovelace: "0" },
    ],
    collateral: { conditional: true, input_count: 1, body_total_lovelace: "2290730", return_lovelace: "75120892" },
    claims: [{ label: "reorganize", value: "Treasury reorganize: merge UTxOs into one continuing output", detail: "Routine treasury maintenance / destination treasury / metadata label 1694 / self-declared", provenance: "metadata_claim", self_declared: true }],
  };
  const envelope = {
    ledger_functional_layer: "cardano-ledger-functional/v1",
    op: "tx.review",
    result: { review },
    resolutions: [
      { raw: "a64d1b9e1aeffe54056034d84977061b45a92691efc282fbee3fc094", label: "Amaru treasury script", type: "overlay:Identifier" },
      { raw: "8bd03209d227956aaf9670751e0aa2057b51c1537a43f155b24fb1c1", label: "Amaru treasury signer", type: "overlay:Identifier" },
    ],
  };
  const first = renderTransactionReview(envelope);
  const second = renderTransactionReview(envelope);
  assert.equal(first, second, "identical envelope in, byte-identical text out");
  assert.match(first, /^Output control groups \(2\)$/m);
  const markers = [first.indexOf("group 1 of 2"), first.indexOf("group 2 of 2")];
  for (const [index, marker] of markers.entries()) assert.notEqual(marker, -1, `group ${index + 1} of 2 must be present`);
  const nextHeading = first.slice(markers[1]).search(/\n\S/);
  const groupsEnd = nextHeading === -1 ? first.length : markers[1] + nextHeading + 1;
  const scriptBlock = first.slice(markers[0], markers[1]);
  const signerBlock = first.slice(markers[1], groupsEnd);
  assert.match(scriptBlock, /^ {4}category[ \t]+script$/m, "the script control group renders inside its own bounded block");
  assert.match(scriptBlock, /^ {4}lovelace[ \t]+611069353175$/m, "the large lovelace is bound to the script control-group block, not merely present under high-value movements");
  assert.match(signerBlock, /^ {4}category[ \t]+signer_controlled$/m);
  assert.match(signerBlock, /^ {4}lovelace[ \t]+75884469$/m, "the signer change lovelace is bound to its own bounded control-group block");
  assert.match(first, /^ {2}fee[ \t]+1527153 lovelace$/m, "the fee renders as an exact lovelace string");
  assert.doesNotMatch(first, /\d{1,3}(,\d{3})+\b/, "no thousands grouping");
  assert.doesNotMatch(first, /\d+\.\d+/, "no decimal point in any lovelace position (no ADA conversion, no float)");
  assert.doesNotMatch(first, /\bNaN\b|\bInfinity\b|\d[eE]\+\d/, "no float artefact");
  assert.doesNotMatch(first, /[\u00a0\u202f\u2009]/, "no locale-dependent non-breaking or thin space grouping");
});

test("T016 (FR-011): empty sections render (none), addresses render in full without truncation, and an absent resolutions key stays distinct from an empty one", () => {
  const emptyReview = {
    version: "cardano-tx-review/v1",
    tx_id: "c1c2c3c4c5c6c7c8c9c0c1c2c3c4c5c6c7c8c9c0c1c2c3c4c5c6c7c8c9c0c1c2",
    body_hash: "d1d2d3d4d5d6d7d8d9d0d1d2d3d4d5d6d7d8d9d0d1d2d3d4d5d6d7d8d9d0d1d2",
    fee: { lovelace: "0" },
    context: { input_status: "complete", regular_input_count: 0, resolved_regular_input_count: 0, missing_regular_input_count: 0 },
    net_signer_value: { provable: true, lovelace: null, note: "no value movement" },
    warnings: [],
    control_groups: [],
    high_value_movements: [],
    sources: [],
    collateral: { conditional: false, input_count: 0, body_total_lovelace: "0", return_lovelace: null },
    claims: [],
  };
  const emptyOutput = renderTransactionReview({ ledger_functional_layer: "cardano-ledger-functional/v1", op: "tx.review", result: { review: emptyReview } });
  for (const heading of ["Output control groups (0)", "High-value movements (0)", "Warnings (0)", "Sources (0)", "Claims (0)"]) {
    assert.match(emptyOutput, new RegExp(`${heading.replace(/[()]/g, "\\$&")}\\n {2}\\(none\\)`), `${heading} renders (none) on its own indented line`);
  }
  assert.match(emptyOutput, /^Collateral$/m, "the collateral section is always present");
  assert.match(emptyOutput, /^ {2}conditional[ \t]+no$/m);
  assert.match(emptyOutput, /^ {2}return lovelace[ \t]+\(not reported\)$/m, "a null scalar renders as (not reported)");
  assert.match(emptyOutput, /^ {2}net signer value lovelace[ \t]+\(not reported\)$/m);
  assert.equal(emptyOutput.includes("Book resolutions"), false, "with no resolutions key the section is omitted entirely; the renderer must not synthesise it");
  const emptyResolutionsOutput = renderTransactionReview({ ledger_functional_layer: "cardano-ledger-functional/v1", op: "tx.review", result: { review: emptyReview }, resolutions: [] });
  assert.match(emptyResolutionsOutput, /Book resolutions \(0, in caller book order; duplicates preserved\)\n {2}\(none\)/, "a present-but-empty resolutions key renders the heading with (none)");
  const scriptAddress = "3132201dc1e82708364c6c42a53f89f675314bb9ad5da2734aa10baa0d32201dc1e82708364c6c42a53f89f675314bb9ad5da2734aa10baa0d";
  const signerAddress = "018bd03209d227956aaf9670751e0aa2057b51c1537a43f155b24fb1c14c7889c658ef4f491a34cf79c35a2e0fe6b0d1b0a856fb9580f2d9c3";
  const addressedReview = { ...emptyReview, control_groups: [{ category: "script", role: "script_lock", role_provenance: "ledger_proven", evidence: ["ledger_proven"], lovelace: "611069353175", asset_class_count: 1, output_count: 2, output_indices: [0, 1], addresses: [scriptAddress, signerAddress], assets: { "8bd03209d227956aaf9670751e0aa2057b51c1537a43f155b24fb1c1": { "414d415255": "500000000" } } }] };
  const addressedOutput = renderTransactionReview({ ledger_functional_layer: "cardano-ledger-functional/v1", op: "tx.review", result: { review: addressedReview } });
  assert.match(addressedOutput, new RegExp(`^ {6}${scriptAddress}$`, "m"), "the full-length script address renders in full on its own line");
  assert.match(addressedOutput, new RegExp(`^ {6}${signerAddress}$`, "m"), "the full-length signer address renders in full on its own line");
  assert.doesNotMatch(addressedOutput, /\.\.\.|…|\bellipsis\b/i, "no truncation or ellipsis of any identifier");
});

test("unrecognised source kind (ruling A-003): fields render verbatim in envelope key order with structured values as compact JSON, one line retained", () => {
  const review = {
    version: "cardano-tx-review/v1",
    tx_id: "a1b2c3d4a1b2c3d4a1b2c3d4a1b2c3d4a1b2c3d4a1b2c3d4a1b2c3d4a1b2c3d4",
    body_hash: "b2c3d4a1b2c3d4a1b2c3d4a1b2c3d4a1b2c3d4a1b2c3d4a1b2c3d4a1b2c3d4a1",
    fee: { lovelace: "0" },
    context: { input_status: "complete", regular_input_count: 0, resolved_regular_input_count: 0, missing_regular_input_count: 0 },
    net_signer_value: { provable: true, lovelace: "0", note: "no net change" },
    warnings: [],
    control_groups: [],
    high_value_movements: [],
    sources: [
      { kind: "future_source", trace_flag: true, nested_context: { depth: 2, tags: ["a", "b"] }, raw_label: "kept as-is", missing_note: null },
    ],
    collateral: { conditional: false, input_count: 0, body_total_lovelace: "0", return_lovelace: null },
    claims: [],
  };
  const output = renderTransactionReview({ ledger_functional_layer: "cardano-ledger-functional/v1", op: "tx.review", result: { review } });
  assert.match(output, /^Sources \(1\)$/m);
  const line = output.split("\n").find((candidate) => candidate.startsWith("  future_source"));
  assert.notEqual(line, undefined, "the unrecognised source renders as its own line keyed on its raw kind");
  assert.ok(line.includes("trace_flag yes"), "the underscored key renders verbatim with its boolean scalar");
  assert.ok(line.includes("nested_context {\"depth\":2,\"tags\":[\"a\",\"b\"]}"), "the structured value round-trips losslessly as compact JSON in document key order");
  assert.ok(line.includes("raw_label kept as-is"), "a string scalar renders verbatim under its raw key");
  assert.ok(line.includes("missing_note (not reported)"), "a null scalar renders (not reported) under its raw key");
  assert.ok(line.indexOf("trace_flag") < line.indexOf("nested_context") && line.indexOf("nested_context") < line.indexOf("raw_label") && line.indexOf("raw_label") < line.indexOf("missing_note"), "fields render in envelope key order");
  assert.doesNotMatch(output, /^ {4}/m, "the unknown source stays one line; no indented block (that shape belongs to Additional inspector fields)");
});

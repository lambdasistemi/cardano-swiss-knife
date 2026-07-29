import { expect, test } from "@playwright/test";

const transactionCbor =
  "84a300d901028001800200a0f5d90103a100a5001b0020000000000001014200ff026568656c6c6f038220666e657374656404a341aa8101616401616402";

const reviewFixture = {
  version: "cardano-tx-review/v1",
  tx_id: "aaaa1111bbbb2222cccc3333dddd4444eeee5555ffff6666aaaa1111bbbb2222",
  body_hash: "cccc3333dddd4444eeee5555ffff6666aaaa1111bbbb2222cccc3333dddd4444",
  fee: { lovelace: "198765" },
  context: {
    input_status: "incomplete",
    regular_input_count: 3,
    resolved_regular_input_count: 1,
    missing_regular_input_count: 2,
  },
  net_signer_value: {
    provable: false,
    lovelace: null,
    note: "missing input context, net signer gain/loss unprovable",
  },
  warnings: [
    "Declared required signer hashes are absent from the witness set.",
    "Metadata describes intent but is self-declared; verify it against the destination addresses and contract policy.",
    "One or more regular inputs could not be resolved from the supplied context.",
    "A script-locked output spends without an inline datum; the spending script must validate the datum hash.",
    "Collateral return address differs from every change address in the transaction.",
  ],
  control_groups: [
    {
      category: "script",
      role: "script_lock",
      role_provenance: "ledger_proven",
      evidence: ["ledger_proven"],
      lovelace: "500000000",
      asset_class_count: 2,
      output_count: 1,
      output_indices: [0],
      addresses: ["3132201dc1e82708364c6c42a53f89f675314bb9ad5da2734aa10baa0d"],
      assets: {
        "8bd03209d227956aaf9670751e0aa2057b51c1537a43f155b24fb1c1": {
          "414d415255": "500000000",
        },
      },
    },
    {
      category: "signer_controlled",
      role: "signer_change",
      role_provenance: "heuristic",
      evidence: ["ledger_proven", "heuristic"],
      lovelace: "75884469",
      asset_class_count: 0,
      output_count: 1,
      output_indices: [1],
      addresses: ["018bd03209d227956aaf9670751e0aa2057b51c1537a43f155b24fb1c14c78"],
      assets: {},
    },
  ],
  high_value_movements: [
    {
      category: "script",
      role: "script_lock",
      role_provenance: "ledger_proven",
      evidence: ["ledger_proven"],
      lovelace: "500000000",
      asset_class_count: 2,
      output_count: 1,
      output_indices: [0],
      addresses: ["3132201dc1e82708364c6c42a53f89f675314bb9ad5da2734aa10baa0d"],
      assets: {
        "8bd03209d227956aaf9670751e0aa2057b51c1537a43f155b24fb1c1": {
          "414d415255": "500000000",
        },
      },
    },
  ],
  sources: [
    { kind: "regular_input", count: 3, resolved_count: 1, missing_count: 2, resolved_lovelace: "2500000" },
    { kind: "withdrawal", count: 1, lovelace: "0" },
    { kind: "collateral", conditional: true, input_count: 1, body_total_lovelace: "2981445", return_lovelace: "75120892" },
    { kind: "reference_input", count: 2, read_only: true },
  ],
  collateral: {
    conditional: true,
    input_count: 1,
    body_total_lovelace: "2981445",
    return_lovelace: "75120892",
  },
  claims: [
    {
      label: "Treasury reorganize",
      value: "Merge UTxOs into one continuing output",
      detail: "Routine treasury maintenance",
      self_declared: true,
    },
  ],
  future_field: { detail: "inspector added this later", count: 3 },
};

const reviewEnvelope = JSON.stringify({
  ledger_functional_layer: "cardano-ledger-functional/v1",
  op: "tx.review",
  result: { review: reviewFixture },
});

async function gotoWorkbench(page) {
  await page.goto("/inspect", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => typeof globalThis.runInspector === "function", undefined, {
    timeout: 90_000,
  });
}

async function installReviewFixture(page, envelope) {
  await page.evaluate((env) => {
    const original = globalThis.runInspector;
    globalThis.__ledgerOperationCalls = [];
    globalThis.runInspector = async (input) => {
      const request = JSON.parse(input);
      if (typeof request?.op === "string") {
        globalThis.__ledgerOperationCalls.push(request.op);
      }
      if (request?.op === "tx.review") {
        return { stdout: env, stderr: "", exitOk: true };
      }
      return original(input);
    };
  }, envelope);
}

async function decodeTransaction(page) {
  await page.getByRole("tab", { name: "Paste CBOR" }).click();
  await page.getByPlaceholder("Paste Conway transaction CBOR hex").fill(transactionCbor);
  await page.getByRole("button", { name: "Decode", exact: true }).click();
  await expect(page.getByRole("button", { name: "Change input" })).toBeVisible({
    timeout: 30_000,
  });
}

const fieldValue = (parent, label) =>
  parent.locator(`.review-field:has(.review-field-label:text-is("${label}"))`).locator(".review-field-value");

test("review calls tx.review and renders version, readiness, and every blocker", async ({
  page,
}) => {
  await gotoWorkbench(page);
  await installReviewFixture(page, reviewEnvelope);
  await decodeTransaction(page);

  const calls = await page.evaluate(() => globalThis.__ledgerOperationCalls);
  const reviewCalls = calls.filter((op) => op === "tx.review");
  expect(reviewCalls).toHaveLength(1);

  const panel = page.locator(".review-panel");
  await expect(panel).toBeVisible({ timeout: 20_000 });

  await expect(panel.locator(".review-version")).toHaveText("cardano-tx-review/v1");

  await expect(panel.locator(".review-tx-id .review-field-value")).toHaveText(reviewFixture.tx_id);
  await expect(panel.locator(".review-body-hash .review-field-value")).toHaveText(reviewFixture.body_hash);
  await expect(panel.locator(".review-fee .review-field-value")).toHaveText("198765");

  const readiness = panel.locator(".review-readiness");
  await expect(fieldValue(readiness, "Input status")).toHaveText("incomplete");
  await expect(fieldValue(readiness, "Regular inputs")).toHaveText("3");
  await expect(fieldValue(readiness, "Resolved regular inputs")).toHaveText("1");
  await expect(fieldValue(readiness, "Missing regular inputs")).toHaveText("2");
  await expect(fieldValue(readiness, "Net signer value provable")).toHaveText("no");
  await expect(fieldValue(readiness, "Net signer value lovelace")).toHaveText("(not reported)");
  await expect(fieldValue(readiness, "Net signer value note")).toHaveText(
    "missing input context, net signer gain/loss unprovable",
  );
  await expect(readiness).not.toContainText("ready");
  await expect(readiness).not.toContainText("not ready");
  await expect(readiness).not.toContainText("signing-ready");

  const blockers = panel.locator(".review-blocker");
  await expect(blockers).toHaveCount(5);
  await expect(blockers.nth(0)).toHaveText(
    "Declared required signer hashes are absent from the witness set.",
  );
  await expect(blockers.nth(1)).toHaveText(
    "Metadata describes intent but is self-declared; verify it against the destination addresses and contract policy.",
  );
  await expect(blockers.nth(2)).toHaveText(
    "One or more regular inputs could not be resolved from the supplied context.",
  );
  await expect(blockers.nth(3)).toHaveText(
    "A script-locked output spends without an inline datum; the spending script must validate the datum hash.",
  );
  await expect(blockers.nth(4)).toHaveText(
    "Collateral return address differs from every change address in the transaction.",
  );

  const additionalFields = panel.locator(".review-additional-fields");
  await expect(additionalFields).toBeVisible();
  const entries = additionalFields.locator(".review-additional-field");
  await expect(entries).toHaveCount(1);
  await expect(entries.nth(0).locator(".review-additional-field-key")).toHaveText("future_field");
  await expect(entries.nth(0).locator(".review-additional-field-value")).toHaveText(
    '{"detail":"inspector added this later","count":3}',
  );
});

test("review renders control categories, provenance, sources, claims, and collateral", async ({
  page,
}) => {
  await gotoWorkbench(page);
  await installReviewFixture(page, reviewEnvelope);
  await decodeTransaction(page);

  const panel = page.locator(".review-panel");
  await expect(panel).toBeVisible({ timeout: 20_000 });

  const groups = panel.locator(".review-control-group");
  await expect(groups).toHaveCount(2);

  const scriptGroup = groups.nth(0);
  await expect(scriptGroup.locator(".review-control-group-category")).toHaveText("script");
  await expect(scriptGroup.locator(".review-control-group-role")).toHaveText("script_lock");
  await expect(scriptGroup.locator(".review-control-group-provenance")).toHaveText("ledger_proven");
  await expect(scriptGroup.locator(".review-control-group-evidence")).toHaveText("ledger_proven");
  await expect(fieldValue(scriptGroup, "Lovelace")).toHaveText("500000000");
  await expect(fieldValue(scriptGroup, "Asset classes")).toHaveText("2");
  await expect(fieldValue(scriptGroup, "Outputs")).toHaveText("1");
  await expect(fieldValue(scriptGroup, "Output indices")).toHaveText("0");
  await expect(scriptGroup.locator(".review-control-group-address")).toHaveText(
    "3132201dc1e82708364c6c42a53f89f675314bb9ad5da2734aa10baa0d",
  );

  const signerGroup = groups.nth(1);
  await expect(signerGroup.locator(".review-control-group-category")).toHaveText("signer_controlled");
  await expect(signerGroup.locator(".review-control-group-role")).toHaveText("signer_change");
  await expect(signerGroup.locator(".review-control-group-provenance")).toHaveText("heuristic");
  await expect(signerGroup.locator(".review-control-group-evidence")).toHaveText("ledger_proven, heuristic");
  await expect(fieldValue(signerGroup, "Lovelace")).toHaveText("75884469");
  await expect(fieldValue(signerGroup, "Asset classes")).toHaveText("0");
  await expect(fieldValue(signerGroup, "Outputs")).toHaveText("1");
  await expect(fieldValue(signerGroup, "Output indices")).toHaveText("1");
  await expect(signerGroup.locator(".review-control-group-address")).toHaveText(
    "018bd03209d227956aaf9670751e0aa2057b51c1537a43f155b24fb1c14c78",
  );

  const movements = panel.locator(".review-high-value-movement");
  await expect(movements).toHaveCount(1);
  const movement = movements.nth(0);
  await expect(movement.locator(".review-control-group-category")).toHaveText("script");
  await expect(movement.locator(".review-control-group-role")).toHaveText("script_lock");
  await expect(movement.locator(".review-control-group-provenance")).toHaveText("ledger_proven");
  await expect(movement.locator(".review-control-group-evidence")).toHaveText("ledger_proven");
  await expect(fieldValue(movement, "Lovelace")).toHaveText("500000000");
  await expect(fieldValue(movement, "Asset classes")).toHaveText("2");
  await expect(fieldValue(movement, "Outputs")).toHaveText("1");
  await expect(fieldValue(movement, "Output indices")).toHaveText("0");
  await expect(movement.locator(".review-control-group-address")).toHaveText(
    "3132201dc1e82708364c6c42a53f89f675314bb9ad5da2734aa10baa0d",
  );

  const sources = panel.locator(".review-source");
  await expect(sources).toHaveCount(4);

  const regularInput = sources.nth(0);
  await expect(regularInput.locator(".review-source-kind")).toHaveText("regular_input");
  await expect(fieldValue(regularInput, "Count")).toHaveText("3");
  await expect(fieldValue(regularInput, "Resolved")).toHaveText("1");
  await expect(fieldValue(regularInput, "Missing")).toHaveText("2");
  await expect(fieldValue(regularInput, "Resolved lovelace")).toHaveText("2500000");

  const withdrawal = sources.nth(1);
  await expect(withdrawal.locator(".review-source-kind")).toHaveText("withdrawal");
  await expect(fieldValue(withdrawal, "Count")).toHaveText("1");
  await expect(fieldValue(withdrawal, "Lovelace")).toHaveText("0");

  const collateralSource = sources.nth(2);
  await expect(collateralSource.locator(".review-source-kind")).toHaveText("collateral");
  await expect(fieldValue(collateralSource, "Conditional")).toHaveText("true");
  await expect(fieldValue(collateralSource, "Input count")).toHaveText("1");
  await expect(fieldValue(collateralSource, "Body total lovelace")).toHaveText("2981445");
  await expect(fieldValue(collateralSource, "Return lovelace")).toHaveText("75120892");

  const refInput = sources.nth(3);
  await expect(refInput.locator(".review-source-kind")).toHaveText("reference_input");
  await expect(fieldValue(refInput, "Count")).toHaveText("2");
  await expect(fieldValue(refInput, "Read only")).toHaveText("true");

  const collateral = panel.locator(".review-collateral");
  await expect(fieldValue(collateral, "Conditional")).toHaveText("true");
  await expect(fieldValue(collateral, "Input count")).toHaveText("1");
  await expect(fieldValue(collateral, "Body total lovelace")).toHaveText("2981445");
  await expect(fieldValue(collateral, "Return lovelace")).toHaveText("75120892");

  const claims = panel.locator(".review-claim");
  await expect(claims).toHaveCount(1);
  const claim = claims.nth(0);
  await expect(fieldValue(claim, "Label")).toHaveText("Treasury reorganize");
  await expect(fieldValue(claim, "Value")).toHaveText("Merge UTxOs into one continuing output");
  await expect(fieldValue(claim, "Detail")).toHaveText("Routine treasury maintenance");
  await expect(fieldValue(claim, "Self declared")).toHaveText("yes");
});

test("review hides additional-fields section when no unmapped keys exist", async ({ page }) => {
  const { future_field: _dropped, ...rest } = reviewFixture;
  const noExtrasEnvelope = JSON.stringify({
    ledger_functional_layer: "cardano-ledger-functional/v1",
    op: "tx.review",
    result: { review: rest },
  });

  await gotoWorkbench(page);
  await installReviewFixture(page, noExtrasEnvelope);
  await decodeTransaction(page);

  const panel = page.locator(".review-panel");
  await expect(panel).toBeVisible({ timeout: 20_000 });
  await expect(panel.locator(".review-additional-fields")).toHaveCount(0);
});

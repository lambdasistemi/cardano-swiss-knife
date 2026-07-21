import { expect, test } from "@playwright/test";
const transactionCbor =
  "84a300d901028001800200a0f5d90103a100a5001b0020000000000001014200ff026568656c6c6f038220666e657374656404a341aa8101616401616402";

const validationFixtures = {
  valid: {
    complete: true,
    valid_for_supplied_context: true,
    checks: [{ id: "ledger.acceptance", title: "Ledger acceptance", status: "passed" }],
  },
  invalid: {
    complete: true,
    valid_for_supplied_context: false,
    failures: [
      {
        code: "value_not_conserved",
        message: "Inputs do not cover outputs and fee.",
      },
    ],
  },
  incomplete: {
    complete: false,
    valid_for_supplied_context: false,
    missing_context: [
      {
        kind: "utxo",
        tx_id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        index: 0,
        message: "Referenced input is unavailable.",
      },
    ],
  },
  rejected: {
    complete: false,
    valid_for_supplied_context: false,
    errors: [
      { code: "malformed_context", message: "Context protocol parameters are required." },
    ],
  },
};

const evaluationFixtures = {
  succeeded: {
    redeemers: [
      {
        purpose: "mint",
        index: 0,
        status: "succeeded",
        declared_ex_units: { memory: "400000", steps: "400000000" },
        evaluated_ex_units: { memory: "376813", steps: "369294715" },
      },
    ],
  },
  failed: {
    redeemers: [
      {
        purpose: "mint",
        index: 0,
        status: "failed",
        declared_ex_units: { memory: "400000", steps: "400000000" },
        failure: {
          code: "script_validation_failure",
          message: "Minting policy returned false.",
        },
      },
    ],
  },
  incomplete: {
    missing_context: [
      { kind: "utxo", message: "Referenced input is unavailable." },
    ],
    redeemers: [
      {
        purpose: "spend",
        index: 2,
        status: "incomplete",
        missing_context: [{ kind: "utxo", message: "Referenced input is unavailable." }],
      },
    ],
  },
  rejected: {
    errors: [{ code: "context_rejected", message: "Protocol context was rejected." }],
    redeemers: [
      {
        purpose: "mint",
        index: 0,
        status: "rejected",
        failure: { code: "context_rejected", message: "Protocol context was rejected." },
      },
    ],
  },
  not_applicable: { redeemers: [] },
};

async function gotoWorkbench(page) {
  await page.goto("/inspect", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => typeof globalThis.runInspector === "function", undefined, {
    timeout: 90_000,
  });
}

async function installLedgerFixture(page, { validation, evaluation, failure } = {}) {
  await page.evaluate(({ validationFixture, evaluationFixture, failureFixture }) => {
    const original = globalThis.runInspector;
    globalThis.__ledgerOperationCalls = [];
    globalThis.runInspector = async (input) => {
      const request = JSON.parse(input);
      if (typeof request?.op === "string") {
        globalThis.__ledgerOperationCalls.push(request.op);
      }
      if (request?.op === "tx.validate" && validationFixture) {
        return {
          stdout: JSON.stringify({
            result: { validation: { status: validationFixture.status, ...validationFixture } },
          }),
          stderr: "",
          exitOk: true,
        };
      }
      if (request?.op === "tx.evaluate.scripts") {
        if (failureFixture === "engine") {
          return { stdout: "", stderr: "forced evaluator engine load failure", exitOk: false };
        }
        if (failureFixture === "protocol") {
          return { stdout: "not-json", stderr: "", exitOk: true };
        }
        if (evaluationFixture) {
          return {
            stdout: JSON.stringify({
              result: {
                script_evaluation: { status: evaluationFixture.status, ...evaluationFixture },
              },
            }),
            stderr: "",
            exitOk: true,
          };
        }
      }
      return original(input);
    };
  }, {
    validationFixture: validation ? { status: validation, ...validationFixtures[validation] } : null,
    evaluationFixture: evaluation ? { status: evaluation, ...evaluationFixtures[evaluation] } : null,
    failureFixture: failure ?? null,
  });
}

async function decodeTransaction(page) {
  await page.getByRole("tab", { name: "Paste CBOR" }).click();
  await page.getByPlaceholder("Paste Conway transaction CBOR hex").fill(transactionCbor);
  await page.getByRole("button", { name: "Decode", exact: true }).click();
  await expect(page.getByRole("button", { name: "Change input" })).toBeVisible({
    timeout: 30_000,
  });
}

for (const [status, fixture] of Object.entries(validationFixtures)) {
  test(`workbench renders the exact ${status} ledger validation verdict`, async ({ page }) => {
    await gotoWorkbench(page);
    await installLedgerFixture(page, { validation: status, evaluation: "not_applicable" });
    await decodeTransaction(page);
    await page.getByRole("tab", { name: "Validation", exact: true }).click();

    const panel = page.getByRole("tabpanel", { name: "Validation" });
    await expect(panel.locator("[data-ledger-validation-status]")).toHaveAttribute(
      "data-ledger-validation-status",
      status,
    );
    await expect(panel.locator(".ledger-validation-status")).toHaveText(status);
    if (status === "invalid") {
      await expect(panel).toContainText(fixture.failures[0].message);
    }
    if (status === "incomplete") {
      await expect(panel).toContainText(fixture.missing_context[0].message);
    }
    if (status === "rejected") {
      await expect(panel).toContainText(fixture.errors[0].message);
    }
  });
}

for (const [status, fixture] of Object.entries(evaluationFixtures)) {
  test(`workbench renders the exact ${status} script-evaluation fixture`, async ({ page }) => {
    await gotoWorkbench(page);
    await installLedgerFixture(page, { validation: "valid", evaluation: status });
    await decodeTransaction(page);
    await page.getByRole("tab", { name: "Validation", exact: true }).click();

    const panel = page.locator(".script-evaluation-panel");
    await expect(panel).toHaveAttribute("data-script-evaluation-status", status);
    await expect(panel.locator(".script-evaluation-status")).toHaveText(status);
    if (fixture.redeemers.length > 0) {
      const redeemer = panel.locator(".script-redeemer-row").first();
      await expect(redeemer).toContainText(`purpose ${fixture.redeemers[0].purpose}`);
      await expect(redeemer).toContainText(`index ${fixture.redeemers[0].index}`);
      await expect(redeemer).toContainText(`status ${fixture.redeemers[0].status}`);
    }
    if (status === "succeeded") {
      await expect(panel).toContainText("declared 400000 memory / 400000000 steps");
      await expect(panel).toContainText("evaluated 376813 memory / 369294715 steps");
    }
    if (status === "failed") {
      await expect(panel).toContainText("script_validation_failure");
      await expect(panel).toContainText("Minting policy returned false.");
    }
    if (status === "incomplete") {
      await expect(panel).toContainText("Referenced input is unavailable.");
    }
    if (status === "rejected") {
      await expect(panel).toContainText("context_rejected");
      await expect(panel).toContainText("Protocol context was rejected.");
    }
    if (status === "not_applicable") {
      await expect(panel).toContainText("No scripts apply to this transaction.");
    }
  });
}

for (const failure of ["engine", "protocol"]) {
  test(`workbench keeps ${failure} evaluator failure explicit and renders no fallback`, async ({ page }) => {
    await gotoWorkbench(page);
    await installLedgerFixture(page, { validation: "valid", failure });
    await decodeTransaction(page);
    await page.getByRole("tab", { name: "Validation", exact: true }).click();

    const panel = page.getByRole("tabpanel", { name: "Validation" });
    await expect(panel.locator(".script-evaluation-error")).toContainText(
      failure === "engine"
        ? "forced evaluator engine load failure"
        : "Ledger script evaluation response was not JSON.",
    );
    await expect(panel.locator(".script-evaluation-panel")).toHaveCount(0);
  });
}

test("workbench rejects unknown validation and script-evaluation statuses as protocol failures", async ({ page }) => {
  await gotoWorkbench(page);
  await installLedgerFixture(page, { validation: "unknown", evaluation: "unknown" });
  await decodeTransaction(page);
  await page.getByRole("tab", { name: "Validation", exact: true }).click();

  const panel = page.getByRole("tabpanel", { name: "Validation" });
  await expect(panel.locator(".ledger-validation-error")).toContainText(
    "Ledger validation response had an unsupported status.",
  );
  await expect(panel.locator(".script-evaluation-error")).toContainText(
    "Ledger script evaluation response had an unsupported status.",
  );
  await expect(panel.locator("[data-ledger-validation-status]")).toHaveCount(0);
  await expect(panel.locator(".script-evaluation-panel")).toHaveCount(0);
});

test("workbench routes validation and script evaluation through the shared operations", async ({ page }) => {
  await gotoWorkbench(page);
  await installLedgerFixture(page, { validation: "valid", evaluation: "succeeded" });
  await decodeTransaction(page);
  expect(await page.evaluate(() => globalThis.__ledgerOperationCalls)).toEqual(
    expect.arrayContaining(["tx.witness.plan", "tx.validate", "tx.evaluate.scripts"]),
  );
});

test("workbench obtains not-applicable script evaluation from the bundled WASI engine", async ({
  page,
}) => {
  await gotoWorkbench(page);
  await installLedgerFixture(page);
  await decodeTransaction(page);
  await page.getByRole("tab", { name: "Validation", exact: true }).click();

  const panel = page.locator(".script-evaluation-panel");
  await expect(panel).toHaveAttribute("data-script-evaluation-status", "not_applicable");
  await expect(panel).toContainText("No scripts apply to this transaction.");
  expect(await page.evaluate(() => globalThis.__ledgerOperationCalls)).toContain(
    "tx.evaluate.scripts",
  );
});

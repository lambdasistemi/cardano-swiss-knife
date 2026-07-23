import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, cpSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)), "..");
const checker = join(repoRoot, "scripts", "check-release-parity.mjs");
const fixturePath = join(repoRoot, "node", "test", "fixtures", "release-parity.json");

// Run the parity checker against a given root directory, returning its exit
// status and combined output. The checker accepts an optional `--root` arg
// defaulting to the repository root.
const runChecker = (root) => {
  const result = spawnSync(process.execPath, [checker, "--root", root], {
    encoding: "utf8",
  });
  return {
    status: result.status,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
  };
};

// Build a temporary mutated copy of the parity inputs. Only the release
// manifest and the parity fixture are copied; the checker reads proof anchors
// relative to `--root`, so the copied tree must stay self-contained for the
// files the checker validates. The real tree is never touched.
const withTamperedFixture = (mutate) => {
  const root = mkdtempSync(join(tmpdir(), "csk-release-parity-"));
  cpSync(join(repoRoot, "release"), join(root, "release"), { recursive: true });
  cpSync(join(repoRoot, "node", "test"), join(root, "node", "test"), { recursive: true });
  for (const p of ["test-vectors", "tests"]) {
    cpSync(join(repoRoot, p), join(root, p), { recursive: true });
  }
  cpSync(join(repoRoot, "cli"), join(root, "cli"), { recursive: true });
  cpSync(join(repoRoot, "node", "src"), join(root, "node", "src"), { recursive: true });
  cpSync(join(repoRoot, "docs", "inspector", "src"), join(root, "docs", "inspector", "src"), { recursive: true });
  const fixtureFile = join(root, "node", "test", "fixtures", "release-parity.json");
  const fixture = JSON.parse(readFileSync(fixtureFile, "utf8"));
  mutate({ fixture, root });
  writeFileSync(fixtureFile, JSON.stringify(fixture, null, 2));
  return root;
};

test("parity checker and fixture exist", () => {
  assert.ok(existsSync(checker), "scripts/check-release-parity.mjs is missing");
  assert.ok(existsSync(fixturePath), "node/test/fixtures/release-parity.json is missing");
});

test("checker passes on the real tree", () => {
  const { status, output } = runChecker(repoRoot);
  assert.equal(status, 0, `checker failed on the real tree:\n${output}`);
});

test("checker fails when a host result diverges in a value byte", () => {
  const root = withTamperedFixture(({ fixture }) => {
    const row = fixture.rows.find((r) => r.capability === "ADDR-001" && r.results.node.ok === true);
    assert.ok(row, "expected a successful ADDR-001 row to tamper");
    row.results.cli.value.networkTag = 0;
  });
  const { status, output } = runChecker(root);
  assert.notEqual(status, 0, "checker did not fail on a divergent host value");
  assert.match(output, /divergen|mismatch|differ/i);
});

test("checker fails when a host result diverges in failure code", () => {
  const root = withTamperedFixture(({ fixture }) => {
    const row = fixture.rows.find((r) => r.capability === "ADDR-001" && r.results.node.ok === false);
    assert.ok(row, "expected a failing ADDR-001 row to tamper");
    row.results.webui.code = "ENGINE_EXECUTION";
  });
  const { status, output } = runChecker(root);
  assert.notEqual(status, 0, "checker did not fail on a divergent failure code");
  assert.match(output, /divergen|mismatch|differ|code/i);
});

test("checker fails when a host result diverges in ok flag", () => {
  const root = withTamperedFixture(({ fixture }) => {
    const row = fixture.rows.find((r) => r.capability === "MN-002" && r.results.node.ok === true);
    assert.ok(row, "expected a successful MN-002 row to tamper");
    row.results.node.ok = false;
    row.results.node.code = "DOMAIN_ERROR";
    delete row.results.node.value;
  });
  const { status, output } = runChecker(root);
  assert.notEqual(status, 0, "checker did not fail on a divergent ok flag");
  assert.match(output, /divergen|mismatch|differ|ok/i);
});

test("checker fails on an unknown capability id", () => {
  const root = withTamperedFixture(({ fixture }) => {
    fixture.rows[0].capability = "NOPE-999";
  });
  const { status, output } = runChecker(root);
  assert.notEqual(status, 0, "checker did not fail on an unknown capability id");
  assert.match(output, /unknown|NOPE-999|capability/i);
});

test("checker fails on a non-parity capability id", () => {
  const root = withTamperedFixture(({ fixture }) => {
    // BLUEPRINT-CATALOG-001 is a classified exclusion, not a parity capability.
    fixture.rows[0].capability = "BLUEPRINT-CATALOG-001";
  });
  const { status, output } = runChecker(root);
  assert.notEqual(status, 0, "checker did not fail on a non-parity capability id");
  assert.match(output, /parity|BLUEPRINT-CATALOG-001|unknown/i);
});

test("checker fails when a parity capability has no fixture coverage", () => {
  const root = withTamperedFixture(({ fixture }) => {
    fixture.rows = fixture.rows.filter((r) => r.capability !== "MN-002");
  });
  const { status, output } = runChecker(root);
  assert.notEqual(status, 0, "checker did not fail on missing coverage");
  assert.match(output, /coverage|missing|MN-002/i);
});

test("checker fails when a known parity row is outside the required inventory", () => {
  const root = withTamperedFixture(({ fixture }) => {
    fixture.rows[0].capability = "MN-001";
  });
  const { status, output } = runChecker(root);
  assert.notEqual(status, 0, "checker did not fail on a row outside requiredCapabilities");
  assert.match(output, /requiredCapabilities|inventory|MN-001/i);
});

test("checker fails when a required parity capability has no fixture coverage", () => {
  const root = withTamperedFixture(({ fixture }) => {
    fixture.rows = fixture.rows.filter((r) => r.capability !== "TX-BOOK-001");
  });
  const { status, output } = runChecker(root);
  assert.notEqual(status, 0, "checker did not fail on missing required inventory coverage");
  assert.match(output, /coverage|required|TX-BOOK-001/i);
});

test("checker fails on a missing declared host evidence anchor", () => {
  const root = withTamperedFixture(({ fixture }) => {
    fixture.hostEvidence.cli.anchor = "cli/does-not-exist.mjs";
  });
  const { status, output } = runChecker(root);
  assert.notEqual(status, 0, "checker did not fail on a missing host evidence anchor");
  assert.match(output, /hostEvidence|anchor|does-not-exist/i);
});

test("checker fails on a missing proof source anchor", () => {
  const root = withTamperedFixture(({ fixture }) => {
    fixture.rows[0].proof = "node/test/fixtures/does-not-exist.json";
  });
  const { status, output } = runChecker(root);
  assert.notEqual(status, 0, "checker did not fail on a missing proof anchor");
  assert.match(output, /proof|does-not-exist|anchor/i);
});

test("checker fails on a malformed result schema", () => {
  const root = withTamperedFixture(({ fixture }) => {
    const row = fixture.rows.find((r) => r.results.node.ok === true);
    // A success result must carry a value; drop it to break the schema.
    delete row.results.cli.value;
  });
  const { status, output } = runChecker(root);
  assert.notEqual(status, 0, "checker did not fail on a malformed result schema");
  assert.match(output, /schema|value|malformed|result/i);
});

test("checker fails when a failure result carries a value", () => {
  const root = withTamperedFixture(({ fixture }) => {
    const row = fixture.rows.find((r) => r.results.node.ok === false);
    row.results.cli.value = { unexpected: true };
  });
  const { status, output } = runChecker(root);
  assert.notEqual(status, 0, "checker did not fail on a failure result carrying a value");
  assert.match(output, /schema|value|malformed|result|failure/i);
});

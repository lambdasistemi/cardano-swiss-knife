import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, cpSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)), "..");
const checker = join(repoRoot, "scripts", "check-release-manifests.mjs");
const capabilitiesPath = join(repoRoot, "release", "capabilities.json");
const enginesPath = join(repoRoot, "release", "engines.json");

// Run the checker against a given root directory, returning its exit status and
// combined output. The checker is expected to accept an optional `--root` arg
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

// Build a temporary mutated copy of the release inputs. `mutate` receives the
// parsed capabilities and engines JSON plus the temp root and may edit them
// before they are written back. Only the two manifest files and flake.lock are
// copied; everything else the checker validates is referenced from the real
// tree via absolute `--root`-relative source paths, so the manifests under the
// temp root must keep pointing at the real repo for source anchors. To keep the
// tampered tree self-contained we copy the whole repo cheaply with cpSync.
const withTamperedTree = (mutate) => {
  const root = mkdtempSync(join(tmpdir(), "csk-release-manifests-"));
  // Copy only what the checker needs to read relative to root: the release
  // manifests and flake.lock. Source/proof anchors are validated against the
  // real repository, so we symlink-free copy those directories too would be
  // expensive; instead the checker resolves source anchors against `--root`.
  // For tampering we therefore copy the full set of files the checker reads:
  // release/, flake.lock, and the anchor-bearing sources.
  cpSync(join(repoRoot, "release"), join(root, "release"), { recursive: true });
  cpSync(join(repoRoot, "flake.lock"), join(root, "flake.lock"));
  for (const dir of ["lib", "node", "cli", "docs", "scripts", "specs", "test", "tests", "test-vectors"]) {
    cpSync(join(repoRoot, dir), join(root, dir), { recursive: true });
  }
  const caps = JSON.parse(readFileSync(join(root, "release", "capabilities.json"), "utf8"));
  const engines = JSON.parse(readFileSync(join(root, "release", "engines.json"), "utf8"));
  mutate({ caps, engines, root });
  writeFileSync(join(root, "release", "capabilities.json"), JSON.stringify(caps, null, 2));
  writeFileSync(join(root, "release", "engines.json"), JSON.stringify(engines, null, 2));
  return root;
};

test("release manifests and checker exist", () => {
  assert.ok(existsSync(capabilitiesPath), "release/capabilities.json is missing");
  assert.ok(existsSync(enginesPath), "release/engines.json is missing");
  assert.ok(existsSync(checker), "scripts/check-release-manifests.mjs is missing");
});

test("checker passes on the real tree", () => {
  const { status, output } = runChecker(repoRoot);
  assert.equal(status, 0, `checker failed on the real tree:\n${output}`);
});

test("checker fails when a parity row loses a host mapping", () => {
  const root = withTamperedTree(({ caps }) => {
    const row = caps.capabilities.find((c) => c.parity === true);
    assert.ok(row, "expected at least one parity row to tamper");
    delete row.hosts.cli;
  });
  const { status, output } = runChecker(root);
  assert.notEqual(status, 0, "checker did not fail on a missing CLI host mapping");
  assert.match(output, /cli/i);
});

test("checker fails on a duplicate capability id", () => {
  const root = withTamperedTree(({ caps }) => {
    const first = caps.capabilities[0];
    caps.capabilities[1].id = first.id;
  });
  const { status, output } = runChecker(root);
  assert.notEqual(status, 0, "checker did not fail on a duplicate id");
  assert.match(output, /duplicate/i);
});

test("checker fails on a nonexistent source/proof anchor", () => {
  const root = withTamperedTree(({ caps }) => {
    const row = caps.capabilities.find((c) => c.parity === true);
    row.proof.path = "node/test/does-not-exist-anchor.mjs";
  });
  const { status, output } = runChecker(root);
  assert.notEqual(status, 0, "checker did not fail on a nonexistent anchor");
  assert.match(output, /does-not-exist-anchor|anchor|proof/i);
});

test("checker fails on engine revision drift from flake.lock", () => {
  const root = withTamperedTree(({ engines }) => {
    engines.engines[0].revision = "0".repeat(40);
  });
  const { status, output } = runChecker(root);
  assert.notEqual(status, 0, "checker did not fail on revision drift");
  assert.match(output, /revision|rev|flake\.lock/i);
});

test("checker fails on engine narHash drift from flake.lock", () => {
  const root = withTamperedTree(({ engines }) => {
    engines.engines[0].narHash = "sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
  });
  const { status, output } = runChecker(root);
  assert.notEqual(status, 0, "checker did not fail on narHash drift");
  assert.match(output, /narHash|hash/i);
});

test("checker fails when an implementation symbol is not declared", () => {
  const root = withTamperedTree(({ caps }) => {
    const row = caps.capabilities.find((c) => c.id === "ADDR-001");
    row.implementation.symbol = "eitherInspectAddressNonexistent";
  });
  const { status, output } = runChecker(root);
  assert.notEqual(status, 0, "checker did not fail on a nonexistent implementation symbol");
  assert.match(output, /symbol|not declared|eitherInspectAddressNonexistent/i);
});

for (const id of ["TX-INSPECT-001", "TX-BROWSE-001", "TX-IDENTIFY-001", "TX-INTENT-001"]) {
  test(`checker fails when ${id} engine-protocol operation is not in the operation set`, () => {
    const unsupported = `tx.frobnicate-${id.toLowerCase()}`;
    const root = withTamperedTree(({ caps }) => {
      const row = caps.capabilities.find((c) => c.id === id);
      row.implementation.operation = unsupported;
    });
    const { status, output } = runChecker(root);
    assert.notEqual(status, 0, `checker did not fail on an unsupported engine-protocol operation for ${id}`);
    assert.match(output, /engine-protocol operation|operation set/);
    assert.ok(output.includes(unsupported), `diagnostic for ${id} did not name the tampered operation '${unsupported}':\n${output}`);
  });
}

test("checker fails when a CLI command is not routed", () => {
  const root = withTamperedTree(({ caps }) => {
    const row = caps.capabilities.find((c) => c.id === "ADDR-001");
    row.hosts.cli.tokens = ["family === \"address\" && command === \"nonexistent\""];
  });
  const { status, output } = runChecker(root);
  assert.notEqual(status, 0, "checker did not fail on an unrouted CLI command");
  assert.match(output, /cli|not routed|nonexistent/i);
});

test("checker fails when a WebUI route is not a real route constructor", () => {
  const root = withTamperedTree(({ caps }) => {
    const row = caps.capabilities.find((c) => c.id === "ADDR-001");
    row.hosts.webui.route = "RouteNonexistent";
  });
  const { status, output } = runChecker(root);
  assert.notEqual(status, 0, "checker did not fail on a nonexistent WebUI route");
  assert.match(output, /route|RouteNonexistent/i);
});

test("checker fails when a WebUI anchor symbol is not referenced", () => {
  const root = withTamperedTree(({ caps }) => {
    const row = caps.capabilities.find((c) => c.id === "ADDR-001");
    row.hosts.webui.symbol = "inspectAddressWithSharedWasmNonexistent";
  });
  const { status, output } = runChecker(root);
  assert.notEqual(status, 0, "checker did not fail on a nonexistent WebUI anchor symbol");
  assert.match(output, /webui|anchor|not referenced|inspectAddressWithSharedWasmNonexistent/i);
});

test("checker fails when a WebUI symbol field is deleted", () => {
  const root = withTamperedTree(({ caps }) => {
    const row = caps.capabilities.find((c) => c.id === "ADDR-001");
    delete row.hosts.webui.symbol;
  });
  const { status, output } = runChecker(root);
  assert.notEqual(status, 0, "checker did not fail on a missing WebUI symbol field");
  assert.match(output, /webui|symbol|missing/i);
});

test("checker fails when the required Blueprint exclusion is removed", () => {
  const root = withTamperedTree(({ caps }) => {
    caps.exclusions = caps.exclusions.filter((e) => e.id !== "BLUEPRINT-CATALOG-001");
  });
  const { status, output } = runChecker(root);
  assert.notEqual(status, 0, "checker did not fail on a missing required Blueprint exclusion");
  assert.match(output, /required exclusion|BLUEPRINT-CATALOG-001|missing/i);
});

test("checker fails when engine attribution uses a wrong-but-known engine", () => {
  const root = withTamperedTree(({ caps }) => {
    const row = caps.capabilities.find((c) => c.id === "TX-VALIDATE-001");
    row.engines = ["cardano-addresses"];
  });
  const { status, output } = runChecker(root);
  assert.notEqual(status, 0, "checker did not fail on a wrong-but-known engine attribution");
  assert.match(output, /engine attribution|architecture mapping/i);
});

test("checker fails when engine attribution references an unknown engine", () => {
  const root = withTamperedTree(({ caps }) => {
    const row = caps.capabilities.find((c) => c.id === "TX-VALIDATE-001");
    row.engines = ["nonexistent-engine"];
  });
  const { status, output } = runChecker(root);
  assert.notEqual(status, 0, "checker did not fail on an unknown engine reference");
  assert.match(output, /unknown engine|nonexistent-engine/i);
});

test("checker fails when the declared CLI command changes but anchors stay", () => {
  const root = withTamperedTree(({ caps }) => {
    const row = caps.capabilities.find((c) => c.id === "TX-VALIDATE-001");
    row.hosts.cli.command = "csk tx frobnicate";
  });
  const { status, output } = runChecker(root);
  assert.notEqual(status, 0, "checker did not fail on a CLI command decoupled from its routing anchors");
  assert.match(output, /command word|frobnicate|not reflected/i);
});

test("checker fails when a host-I/O row drops its engineNote", () => {
  const root = withTamperedTree(({ caps }) => {
    const row = caps.capabilities.find((c) => c.id === "TX-SUBMIT-001");
    delete row.engineNote;
  });
  const { status, output } = runChecker(root);
  assert.notEqual(status, 0, "checker did not fail on a host-I/O row missing engineNote");
  assert.match(output, /engineNote|engine/i);
});

test("checker fails when a required capability is removed", () => {
  const root = withTamperedTree(({ caps }) => {
    caps.capabilities = caps.capabilities.filter((c) => c.id !== "TX-SUBMIT-001");
  });
  const { status, output } = runChecker(root);
  assert.notEqual(status, 0, "checker did not fail on a missing required capability");
  assert.match(output, /required capability|TX-SUBMIT-001|missing/i);
});

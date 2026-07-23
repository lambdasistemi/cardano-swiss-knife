#!/usr/bin/env node
// Cross-host parity checker for cardano-swiss-knife.
//
// Validates node/test/fixtures/release-parity.json against the committed
// release/capabilities.json manifest and the real proof anchors. Fails (exit 1)
// with a precise diagnostic on any missing parity coverage, unknown or
// non-parity capability id, missing proof source anchor, malformed result
// schema, or any byte/value/error divergence between the normalized WebUI, CLI,
// and Node results. The three host results are compared as independently
// recorded normalized outcomes; the checker never derives one host's result
// from another's.
//
// Usage: check-release-parity.mjs [--root DIR]
//   --root  repository root containing release/ and node/test/fixtures/
//           (defaults to the parent of this script's directory).

import { readFileSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const option = (name) => {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
};

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(option("--root") ?? join(scriptDir, ".."));

const errors = [];
const fail = (message) => errors.push(message);

const readJson = (path, label) => {
  if (!existsSync(path)) {
    fail(`${label} is missing: ${path}`);
    return undefined;
  }
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    fail(`${label} is not valid JSON: ${path}: ${error.message}`);
    return undefined;
  }
};

const isNonEmptyString = (value) => typeof value === "string" && value.trim() !== "";

const HOSTS = ["webui", "cli", "node"];

// Deep structural equality for normalized JSON values (bytes/values must match
// exactly; key order is not significant).
const deepEqual = (a, b) => {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    return a.length === b.length && a.every((item, index) => deepEqual(item, b[index]));
  }
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key) => Object.prototype.hasOwnProperty.call(b, key) && deepEqual(a[key], b[key]));
};

// Validate one normalized host result. A success carries a deep `value`; a
// typed failure carries only a stable `code` (no value, no host-formatted
// message). Returns an array of schema violations.
const resultSchemaErrors = (result, where) => {
  const problems = [];
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    problems.push(`${where}: result must be an object`);
    return problems;
  }
  if (typeof result.ok !== "boolean") {
    problems.push(`${where}: result.ok must be a boolean`);
    return problems;
  }
  if (result.ok === true) {
    if (!Object.prototype.hasOwnProperty.call(result, "value")) {
      problems.push(`${where}: success result must carry a 'value'`);
    }
    if (Object.prototype.hasOwnProperty.call(result, "code")) {
      problems.push(`${where}: success result must not carry a failure 'code'`);
    }
  } else {
    if (!isNonEmptyString(result.code)) {
      problems.push(`${where}: failure result must carry a non-empty 'code'`);
    }
    if (Object.prototype.hasOwnProperty.call(result, "value")) {
      problems.push(`${where}: failure result must not carry a 'value'`);
    }
  }
  return problems;
};

// --- Load inputs -----------------------------------------------------------

const capabilities = readJson(join(root, "release", "capabilities.json"), "release/capabilities.json");
const fixture = readJson(join(root, "node", "test", "fixtures", "release-parity.json"), "node/test/fixtures/release-parity.json");

const checkParity = () => {
  if (!capabilities || !fixture) return;
  if (!Number.isInteger(fixture.schemaVersion)) fail("release-parity.json: schemaVersion must be an integer");

  // Index the parity capabilities from the committed manifest.
  const capabilityRows = Array.isArray(capabilities.capabilities) ? capabilities.capabilities : [];
  const parityById = new Map();
  for (const row of capabilityRows) {
    if (row && typeof row.id === "string" && row.parity === true) parityById.set(row.id, row);
  }

  // The fixture explicitly declares its reviewed representative inventory. This
  // is deliberately smaller than the complete manifest (which is checked by
  // check-release-manifests), but it is closed: a row may not silently expand
  // parity coverage outside the reviewed inventory.
  const requiredCapabilities = fixture.requiredCapabilities;
  const required = new Set();
  if (!Array.isArray(requiredCapabilities) || requiredCapabilities.length === 0 || !requiredCapabilities.every(isNonEmptyString)) {
    fail("release-parity.json: requiredCapabilities must be a non-empty array of capability ids");
  } else {
    for (const id of requiredCapabilities) {
      if (required.has(id)) fail(`release-parity.json: requiredCapabilities contains duplicate '${id}'`);
      required.add(id);
      if (!parityById.has(id)) {
        fail(`release-parity.json: requiredCapabilities entry '${id}' is not a parity capability in release/capabilities.json`);
      }
    }
  }

  // Evidence may be declared once for the fixture suite rather than repeated
  // on every vector. It names distinct real source anchors for each host. The
  // WebUI entry is source provenance only; this Node checker never claims to
  // execute a live browser.
  const hostEvidence = fixture.hostEvidence;
  if (!hostEvidence || typeof hostEvidence !== "object" || Array.isArray(hostEvidence)) {
    fail("release-parity.json: hostEvidence object with webui, cli, and node anchors is required");
  } else {
    const evidenceAnchors = new Set();
    for (const host of HOSTS) {
      const evidence = hostEvidence[host];
      const where = `release-parity.json hostEvidence.${host}`;
      if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
        fail(`${where}: evidence object is required`);
        continue;
      }
      if (!isNonEmptyString(evidence.kind)) fail(`${where}: kind must be a non-empty string`);
      if (!isNonEmptyString(evidence.anchor)) {
        fail(`${where}: anchor must name a non-empty source path`);
      } else if (!existsSync(join(root, evidence.anchor))) {
        fail(`${where}: source anchor does not exist: ${evidence.anchor}`);
      } else if (evidenceAnchors.has(evidence.anchor)) {
        fail(`${where}: source anchor must be distinct for each host: ${evidence.anchor}`);
      } else {
        evidenceAnchors.add(evidence.anchor);
      }
    }
  }

  const rows = fixture.rows;
  if (!Array.isArray(rows) || rows.length === 0) {
    fail("release-parity.json: rows must be a non-empty array");
    return;
  }

  const covered = new Set();
  rows.forEach((row, index) => {
    const where = `release-parity.json row ${index} (${row?.capability ?? "<no capability>"})`;
    if (!isNonEmptyString(row?.capability)) {
      fail(`${where}: capability must be a non-empty string`);
      return;
    }
    // Unknown or non-parity capability ids are rejected: every fixture row must
    // name a real parity capability from the committed manifest.
    if (!parityById.has(row.capability)) {
      const known = capabilityRows.some((c) => c?.id === row.capability);
      fail(`${where}: capability '${row.capability}' is ${known ? "not a parity capability" : "unknown"} in release/capabilities.json`);
      return;
    }
    if (!required.has(row.capability)) {
      fail(`${where}: capability '${row.capability}' is outside the requiredCapabilities inventory`);
      return;
    }
    covered.add(row.capability);

    // Proof source anchor must exist.
    if (!isNonEmptyString(row.proof)) {
      fail(`${where}: proof must name a non-empty proof source path`);
    } else if (!existsSync(join(root, row.proof))) {
      fail(`${where}: proof source anchor does not exist: ${row.proof}`);
    }

    // Representative input must be present.
    if (row.input === undefined || row.input === null) {
      fail(`${where}: input is required`);
    }

    // All three host results, each schema-valid.
    const results = row.results;
    if (!results || typeof results !== "object") {
      fail(`${where}: results object with webui, cli, and node is required`);
      return;
    }
    for (const host of HOSTS) {
      for (const problem of resultSchemaErrors(results[host], `${where} results.${host}`)) {
        fail(problem);
      }
    }
    const present = HOSTS.every((host) => results[host] && typeof results[host] === "object" && typeof results[host].ok === "boolean");
    if (!present) return;

    // Cross-host equality: ok flag, then value bytes or failure code.
    const [webui, cli, node] = HOSTS.map((host) => results[host]);
    if (!(webui.ok === cli.ok && cli.ok === node.ok)) {
      fail(`${where}: host ok flags diverge (webui=${webui.ok} cli=${cli.ok} node=${node.ok})`);
      return;
    }
    if (webui.ok) {
      if (!deepEqual(webui.value, cli.value) || !deepEqual(cli.value, node.value)) {
        fail(`${where}: host success values diverge (byte/value mismatch between webui, cli, and node)`);
      }
    } else if (!(webui.code === cli.code && cli.code === node.code)) {
      fail(`${where}: host failure codes diverge (webui='${webui.code}' cli='${cli.code}' node='${node.code}')`);
    }
  });

  // Every reviewed inventory item must have at least one vector.
  for (const id of required) {
    if (!covered.has(id)) {
      fail(`release-parity.json: required parity capability '${id}' has no fixture coverage`);
    }
  }
};

checkParity();

if (errors.length > 0) {
  for (const error of errors) console.error(`release-parity: ${error}`);
  console.error(`release-parity: ${errors.length} error(s)`);
  process.exit(1);
}
console.log("release-parity: cross-host parity fixture is consistent with the capability manifest and proof anchors");

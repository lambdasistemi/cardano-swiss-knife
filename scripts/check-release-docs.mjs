#!/usr/bin/env node
// Strict operator-manual documentation contract for cardano-swiss-knife.
//
// Reads release/capabilities.json and release/engines.json as the sole
// authority and verifies the operator/reference docs map every entry without
// invention or omission. Also requires concrete operator procedures, host/
// engine hazard sections, and MkDocs navigation for the new pages.
//
// Usage:
//   check-release-docs.mjs [--root DIR]

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const option = (name) => {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
};

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(option("--root") ?? option("--repo-root") ?? join(scriptDir, ".."));

const errors = [];
const fail = (message) => errors.push(message);

const readText = (relativePath) => {
  const path = join(repoRoot, relativePath);
  if (!existsSync(path)) {
    fail(`missing required documentation file: ${relativePath}`);
    return undefined;
  }
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    fail(`failed to read ${relativePath}: ${error.message}`);
    return undefined;
  }
};

const readJson = (relativePath) => {
  const text = readText(relativePath);
  if (text === undefined) return undefined;
  try {
    return JSON.parse(text);
  } catch (error) {
    fail(`failed to parse ${relativePath}: ${error.message}`);
    return undefined;
  }
};

/** Extract the body between paired <!-- release-docs:kind:id --> markers. */
const extractBlock = (text, kind, id) => {
  const open = `<!-- release-docs:${kind}:${id} -->`;
  const close = `<!-- /release-docs:${kind}:${id} -->`;
  const start = text.indexOf(open);
  if (start < 0) return undefined;
  const bodyStart = start + open.length;
  const end = text.indexOf(close, bodyStart);
  if (end < 0) return undefined;
  return text.slice(bodyStart, end);
};

const isNonEmptyString = (value) =>
  typeof value === "string" && value.trim().length > 0;

const requireInBlock = (block, where, needle, label) => {
  // Missing manifest fields must fail hard. Never coerce `undefined` to the
  // literal string "undefined" (JavaScript's String(undefined)) and accept a
  // matching false documentation mapping.
  if (!isNonEmptyString(needle)) {
    fail(
      `${where}: required ${label} is missing or empty in the authoritative manifest`,
    );
    return;
  }
  if (needle === "undefined") {
    fail(
      `${where}: required ${label} must not be the literal string "undefined"`,
    );
    return;
  }
  if (!block.includes(needle)) {
    fail(`${where}: missing required ${label}: ${needle}`);
  }
};

/**
 * Require an authoritative value under an explicit label so generic prose or
 * an id substring (e.g. flakeInput === engine id) cannot satisfy the contract.
 * Accepts "Label: value" or "Label: `value`" forms.
 */
const requireLabeledInBlock = (block, where, labels, needle, label) => {
  if (!isNonEmptyString(needle)) {
    fail(
      `${where}: required ${label} is missing or empty in the authoritative manifest`,
    );
    return;
  }
  if (needle === "undefined") {
    fail(
      `${where}: required ${label} must not be the literal string "undefined"`,
    );
    return;
  }
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matched = labels.some((docLabel) => {
    const re = new RegExp(
      `${docLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:\\s*\`?${escaped}\`?`,
      "i",
    );
    return re.test(block);
  });
  if (!matched) {
    fail(`${where}: missing required ${label}: ${needle}`);
  }
};

const listBlockIds = (text, kind) => {
  // Match only open markers: <!-- release-docs:kind:id --> (not closes).
  const openRe = new RegExp(`<!-- release-docs:${kind}:([^\\s]+) -->`, "g");
  const ids = [];
  let match;
  while ((match = openRe.exec(text)) !== null) {
    ids.push(match[1]);
  }
  return ids;
};

const REQUIRED_PROCEDURES = [
  {
    id: "npm-install",
    file: "docs/installation.md",
    mustInclude: ["@lambdasistemi/cardano-swiss-knife", "npm install"],
  },
  {
    id: "nix-install",
    file: "docs/installation.md",
    mustInclude: ["packages.csk", "nix"],
  },
  {
    id: "cli-commands",
    file: "docs/user/usage.md",
    mustInclude: ["csk address inspect", "csk vault", "csk tx"],
  },
  {
    id: "node-api",
    file: "docs/user/usage.md",
    mustInclude: ["@lambdasistemi/cardano-swiss-knife", "inspectAddress"],
  },
  {
    id: "vault-migration",
    file: "docs/user/vault.md",
    mustInclude: ["csk vault migrate", "csk vault create", "csk vault list"],
  },
  {
    id: "credentials",
    file: "docs/user/vault.md",
    mustInclude: ["--passphrase-fd", "environment"],
  },
  {
    id: "stable-outputs",
    file: "docs/user/usage.md",
    mustInclude: ["--output json", "exit"],
  },
  {
    id: "version-verify",
    file: "docs/user/versions.md",
    mustInclude: ["csk --version", "package.json"],
  },
  {
    id: "checksum-verify",
    file: "docs/user/versions.md",
    mustInclude: ["SHA256SUMS", "sha256"],
  },
  {
    id: "release-operation",
    file: "docs/dev/releasing.md",
    mustInclude: ["release-please", "npm publish"],
  },
  {
    id: "troubleshooting",
    file: "docs/troubleshooting.md",
    mustInclude: ["ENGINE_", "fallback"],
  },
];

const REQUIRED_HAZARDS = [
  {
    id: "host-engine-boundary",
    file: "docs/architecture/system.md",
    mustInclude: ["hosts own", "engines"],
  },
  {
    id: "semantic-drift",
    file: "docs/architecture/system.md",
    mustInclude: ["semantic drift"],
  },
  {
    id: "fail-hard-engines",
    file: "docs/architecture/system.md",
    mustInclude: ["missing", "incompatible", "fail"],
  },
  {
    id: "no-fallback",
    file: "docs/architecture/system.md",
    mustInclude: ["silent fallback", "reimplementation"],
  },
  {
    id: "embedded-plutus",
    file: "docs/architecture/system.md",
    mustInclude: ["Plutus", "wasm-tx-inspector"],
  },
];

const REQUIRED_NAV_PATHS = [
  "reference/capabilities.md",
  "reference/engines.md",
  "troubleshooting.md",
  "installation.md",
  "user/usage.md",
  "user/vault.md",
  "user/versions.md",
  "architecture/system.md",
  "architecture/release-flow.md",
  "dev/releasing.md",
];

/**
 * Two authoritative implementation shapes are supported:
 * - shared-symbol (default / kind absent or "purescript"): module, symbol, source
 * - engine-protocol: kind, operation, protocolSource, note
 *
 * Required fields of the active variant must be non-empty strings and must
 * appear in the documentation block. Never render or accept `undefined`.
 */
const checkImplementation = (block, where, impl) => {
  if (!impl || typeof impl !== "object" || Array.isArray(impl)) {
    fail(`${where}: implementation object is required`);
    return;
  }
  const kind = isNonEmptyString(impl.kind) ? impl.kind : "shared-symbol";
  if (kind === "engine-protocol") {
    for (const [field, label] of [
      ["kind", "implementation kind"],
      ["operation", "engine-protocol operation"],
      ["protocolSource", "protocol source"],
      ["note", "implementation note"],
    ]) {
      if (!isNonEmptyString(impl[field])) {
        fail(
          `${where}: implementation.${field} must be a non-empty string for engine-protocol`,
        );
      } else {
        requireInBlock(block, where, impl[field], label);
      }
    }
    return;
  }
  if (kind !== "shared-symbol" && kind !== "purescript") {
    fail(
      `${where}: implementation.kind '${kind}' must be 'shared-symbol', 'purescript', or 'engine-protocol'`,
    );
    return;
  }
  for (const [field, label] of [
    ["module", "implementation module"],
    ["symbol", "implementation symbol"],
    ["source", "implementation source"],
  ]) {
    if (!isNonEmptyString(impl[field])) {
      fail(
        `${where}: implementation.${field} must be a non-empty string for shared-symbol`,
      );
    } else {
      requireInBlock(block, where, impl[field], label);
    }
  }
};

const checkCapabilities = (capabilities, text) => {
  if (text === undefined) return;
  const file = "docs/reference/capabilities.md";
  const documented = new Set(listBlockIds(text, "capability"));
  const known = new Set(capabilities.map((row) => row.id));

  for (const row of capabilities) {
    const where = `${file} capability ${row.id}`;
    const block = extractBlock(text, "capability", row.id);
    if (block === undefined) {
      fail(`${where}: missing paired release-docs capability block`);
      continue;
    }
    requireInBlock(block, where, row.id, "capability id");
    requireInBlock(block, where, row.operation, "operation title");
    checkImplementation(block, where, row.implementation);
    requireInBlock(block, where, row.hosts.webui.route, "WebUI route");
    requireInBlock(block, where, row.hosts.cli.command, "CLI command");
    requireInBlock(block, where, row.hosts.node.export, "Node export");
    requireInBlock(block, where, row.proof.path, "proof path");
    for (const engine of row.engines) {
      requireInBlock(block, where, engine, "engine id");
    }
  }

  for (const id of documented) {
    if (!known.has(id)) {
      fail(`${file}: documents invented capability id not in release/capabilities.json: ${id}`);
    }
  }

  for (const id of known) {
    if (!documented.has(id)) {
      fail(`${file}: omits capability id from release/capabilities.json: ${id}`);
    }
  }
};

const checkEngines = (engines, text) => {
  if (text === undefined) return;
  const file = "docs/reference/engines.md";
  const documented = new Set(listBlockIds(text, "engine"));
  const known = new Set(engines.map((row) => row.id));

  for (const row of engines) {
    const where = `${file} engine ${row.id}`;
    const block = extractBlock(text, "engine", row.id);
    if (block === undefined) {
      fail(`${where}: missing paired release-docs engine block`);
      continue;
    }
    requireInBlock(block, where, row.id, "engine id");
    requireInBlock(block, where, row.artifact, "artifact");
    requireInBlock(block, where, row.sourceRepository, "source repository");
    // Label-bound so flakeInput cannot be satisfied by the engine id heading
    // alone when provenance mapping is deleted or replaced with generic prose.
    requireLabeledInBlock(
      block,
      where,
      ["Flake input", "flakeInput", "flake input"],
      row.flakeInput,
      "flake input",
    );
    requireInBlock(block, where, row.revision, "revision");
    requireInBlock(block, where, row.narHash, "narHash");
    requireInBlock(block, where, row.owningLanguage, "owning language");
    requireLabeledInBlock(
      block,
      where,
      ["Protocol", "protocolContract", "protocol contract"],
      row.protocolContract,
      "protocol contract",
    );
    requireLabeledInBlock(
      block,
      where,
      ["Responsibility", "responsibility"],
      row.responsibility,
      "responsibility",
    );
    requireInBlock(block, where, row.packagedPath, "packaged path");
    requireInBlock(block, where, row.failHard, "fail-hard behavior");
    if (row.noFallback !== true) {
      fail(`${where}: engines.json noFallback must be true for documented engines`);
    }
    // Require explicit no-fallback wording inside the engine block itself.
    if (!/no[- ]fallback/i.test(block) && !block.includes("noFallback")) {
      fail(`${where}: missing explicit no-fallback warning in engine documentation`);
    }
    if (row.embeddedPlutus) {
      requireInBlock(block, where, "embedded Plutus", "embedded Plutus label");
      requireInBlock(
        block,
        where,
        "separate Plutus WASI artifact",
        "separate Plutus WASI prohibition",
      );
      for (const library of row.embeddedPlutus.libraries ?? []) {
        requireInBlock(block, where, library, "embedded Plutus library");
      }
    }
  }

  for (const id of documented) {
    if (!known.has(id)) {
      fail(`${file}: documents invented engine id not in release/engines.json: ${id}`);
    }
  }

  for (const id of known) {
    if (!documented.has(id)) {
      fail(`${file}: omits engine id from release/engines.json: ${id}`);
    }
  }
};

const checkProcedures = () => {
  for (const procedure of REQUIRED_PROCEDURES) {
    const text = readText(procedure.file);
    if (text === undefined) continue;
    const where = `${procedure.file} procedure ${procedure.id}`;
    const block = extractBlock(text, "procedure", procedure.id);
    if (block === undefined) {
      fail(`${where}: missing paired release-docs procedure block`);
      continue;
    }
    if (block.trim().length < 40) {
      fail(`${where}: procedure block is too short to be operator-usable`);
    }
    for (const needle of procedure.mustInclude) {
      requireInBlock(block, where, needle, "procedure content");
    }
  }
};

const checkHazards = () => {
  for (const hazard of REQUIRED_HAZARDS) {
    const text = readText(hazard.file);
    if (text === undefined) continue;
    const where = `${hazard.file} hazard ${hazard.id}`;
    const block = extractBlock(text, "hazard", hazard.id);
    if (block === undefined) {
      fail(`${where}: missing paired release-docs hazard block`);
      continue;
    }
    if (block.trim().length < 40) {
      fail(`${where}: hazard block is too short to be operator-usable`);
    }
    for (const needle of hazard.mustInclude) {
      if (!block.toLowerCase().includes(needle.toLowerCase())) {
        fail(`${where}: missing required hazard content: ${needle}`);
      }
    }
  }
};

const checkMkdocsNav = () => {
  const text = readText("mkdocs.yml");
  if (text === undefined) return;
  for (const path of REQUIRED_NAV_PATHS) {
    if (!text.includes(path)) {
      fail(`mkdocs.yml: missing navigation entry for ${path}`);
    }
  }
};

const checkReadme = () => {
  const text = readText("README.md");
  if (text === undefined) return;
  for (const needle of [
    "docs/reference/capabilities.md",
    "docs/reference/engines.md",
    "docs/troubleshooting.md",
    "docs/installation.md",
  ]) {
    if (!text.includes(needle)) {
      fail(`README.md: missing operator-manual pointer to ${needle}`);
    }
  }
};

const capabilities = readJson("release/capabilities.json");
const enginesDoc = readJson("release/engines.json");

if (capabilities?.capabilities) {
  checkCapabilities(capabilities.capabilities, readText("docs/reference/capabilities.md"));
} else if (capabilities !== undefined) {
  fail("release/capabilities.json: capabilities array is missing");
}

if (enginesDoc?.engines) {
  checkEngines(enginesDoc.engines, readText("docs/reference/engines.md"));
} else if (enginesDoc !== undefined) {
  fail("release/engines.json: engines array is missing");
}

// Ensure troubleshooting file existence is always checked even when procedures
// re-read it; missing file surfaces once via readText.
readText("docs/troubleshooting.md");
readText("docs/architecture/release-flow.md");

checkProcedures();
checkHazards();
checkMkdocsNav();
checkReadme();

if (errors.length > 0) {
  for (const error of errors) {
    console.error(`release-docs: ${error}`);
  }
  console.error(`release-docs: ${errors.length} contract violation(s)`);
  process.exit(1);
}

console.log("release-docs: ok");
process.exit(0);

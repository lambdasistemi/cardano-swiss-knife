#!/usr/bin/env node
// Release manifest checker for cardano-swiss-knife.
//
// Validates release/capabilities.json and release/engines.json against the real
// source tree and the top-level flake.lock. Fails (exit 1) with a precise
// diagnostic on any schema gap, missing host mapping, duplicate id, nonexistent
// source/proof anchor or symbol, unrouted CLI command, missing WebUI
// anchor/route/symbol, missing explicit exclusion, incomplete engine or
// capability inventory, or engine revision/narHash drift from flake.lock.
//
// Usage: check-release-manifests.mjs [--root DIR]
//   --root  repository root containing release/, flake.lock, and sources
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

const readSource = (relPath) => {
  const path = join(root, relPath);
  if (!existsSync(path)) return undefined;
  try {
    return readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
};

// Resolve a PureScript module name (e.g. "Cardano.Address.Inspect") to its
// source path under lib/src.
const moduleToPath = (moduleName) => `lib/src/${moduleName.split(".").join("/")}.purs`;

// Declaration-aware checks. These prove a module or symbol is genuinely
// declared, not merely present as a comment or unrelated substring.

// Escape a literal string for use inside a RegExp.
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// True when the file declares the PureScript module `moduleName` in its module
// header (e.g. "module Cardano.Address.Inspect (...) where").
const declaresModule = (text, moduleName) => {
  const pattern = new RegExp(`^module\\s+${escapeRegExp(moduleName)}(\\s|\\()`, "m");
  return pattern.test(text);
};

// True when the file declares the value/foreign symbol `symbol`. Matches a
// same-line type signature ("sym ::"), a multi-line signature where the name
// stands alone on its line followed by an indented "::" (e.g.
// "constructByronAddress\n  :: ..."), or a foreign import
// ("foreign import sym ::").
const declaresSymbol = (text, symbol) => {
  const name = escapeRegExp(symbol);
  const sameLine = new RegExp(`^${name}\\s*::`, "m");
  const multiLine = new RegExp(`^${name}\\s*\\r?\\n[ \\t]+::`, "m");
  const foreign = new RegExp(`^foreign\\s+import\\s+${name}(\\s*::|\\s*$)`, "m");
  return sameLine.test(text) || multiLine.test(text) || foreign.test(text);
};

// True when the file references an anchor. Quoted anchors (e.g. "\"tx.inspect\"")
// must appear verbatim; identifier anchors must appear as a whole word so a
// longer unrelated identifier does not satisfy the check.
const referencesAnchor = (text, anchor) => {
  if (anchor.startsWith("\"") || anchor.startsWith("'")) return text.includes(anchor);
  const pattern = new RegExp(`\\b${escapeRegExp(anchor)}\\b`);
  return pattern.test(text);
};

// The authoritative engine set that must be present, keyed by flake input.
const REQUIRED_ENGINES = ["cardano-addresses", "cardano-ledger-inspector", "rdf-shapes-wasm"];

// The retained #70 offline inventory plus the later parity capabilities that
// must all be present for the manifest to be complete.
const REQUIRED_CAPABILITY_IDS = [
  "ADDR-001",
  "MN-001", "MN-002",
  "KEY-001", "KEY-002", "KEY-003", "KEY-004", "KEY-005", "KEY-006",
  "PAY-001", "PAY-002",
  "SCR-001", "SCR-002", "SCR-003",
  "TX-LOAD-001",
  "TX-INSPECT-001", "TX-BROWSE-001", "TX-IDENTIFY-001", "TX-INTENT-001",
  "TX-BOOK-001",
  "TX-WITNESS-PREPARE-001", "TX-WITNESS-NORMALISE-001", "TX-WITNESS-PLAN-001", "TX-WITNESS-ATTACH-001",
  "TX-VALIDATE-001", "TX-EVALUATE-001",
  "TX-SUBMIT-001",
];

// The reviewed architecture mapping of capability id to its authoritative
// engine set. This is the engine-attribution contract: a wrong-but-known
// substitution (for example attributing ledger validation to the address
// engine) must fail. Empty sets are host-owned shared I/O (provider
// HTTP/submission) or pure shared-library work (witness normalisation) with no
// authoritative engine.
const EXPECTED_CAPABILITY_ENGINES = {
  "ADDR-001": ["cardano-addresses"],
  "MN-001": ["cardano-addresses"],
  "MN-002": ["cardano-addresses"],
  "KEY-001": ["cardano-addresses"],
  "KEY-002": ["cardano-addresses"],
  "KEY-003": ["cardano-addresses"],
  "KEY-004": ["cardano-addresses"],
  "KEY-005": ["cardano-addresses"],
  "KEY-006": ["cardano-addresses"],
  "PAY-001": ["cardano-addresses"],
  "PAY-002": ["cardano-addresses"],
  "SCR-001": ["cardano-addresses"],
  "SCR-002": ["cardano-addresses"],
  "SCR-003": ["cardano-addresses"],
  "TX-LOAD-001": [],
  "TX-INSPECT-001": ["cardano-ledger-inspector"],
  "TX-BROWSE-001": ["cardano-ledger-inspector"],
  "TX-IDENTIFY-001": ["cardano-ledger-inspector"],
  "TX-INTENT-001": ["cardano-ledger-inspector"],
  "TX-BOOK-001": ["cardano-ledger-inspector", "rdf-shapes-wasm"],
  "TX-WITNESS-PREPARE-001": ["cardano-addresses"],
  "TX-WITNESS-NORMALISE-001": [],
  "TX-WITNESS-PLAN-001": ["cardano-ledger-inspector"],
  "TX-WITNESS-ATTACH-001": ["cardano-ledger-inspector"],
  "TX-VALIDATE-001": ["cardano-ledger-inspector"],
  "TX-EVALUATE-001": ["cardano-ledger-inspector"],
  "TX-SUBMIT-001": [],
};

// Deliberate non-parity exclusions that must be explicitly classified. Each
// entry maps a stable exclusion id to a substring that must appear in the
// exclusion's surface, so removing the exclusion breaks completeness.
const REQUIRED_EXCLUSIONS = {
  "BLUEPRINT-CATALOG-001": "Blueprint catalog",
};

// --- Load inputs -----------------------------------------------------------

const capabilities = readJson(join(root, "release", "capabilities.json"), "release/capabilities.json");
const engines = readJson(join(root, "release", "engines.json"), "release/engines.json");
const flakeLock = readJson(join(root, "flake.lock"), "flake.lock");

// --- Engine manifest vs flake.lock ----------------------------------------

const checkEngines = () => {
  if (!engines) return;
  if (!Number.isInteger(engines.schemaVersion)) fail("engines.json: schemaVersion must be an integer");
  if (!Array.isArray(engines.engines) || engines.engines.length === 0) {
    fail("engines.json: engines must be a non-empty array");
    return;
  }
  const seen = new Set();
  for (const engine of engines.engines) {
    const where = `engines.json engine ${engine?.id ?? "<no id>"}`;
    if (!isNonEmptyString(engine?.id)) { fail(`${where}: id must be a non-empty string`); continue; }
    if (seen.has(engine.id)) fail(`${where}: duplicate engine id '${engine.id}'`);
    seen.add(engine.id);
    for (const field of ["artifact", "sourceRepository", "flakeInput", "revision", "narHash", "owningLanguage", "protocolContract", "responsibility", "packagedPath", "failHard"]) {
      if (!isNonEmptyString(engine[field])) fail(`${where}: '${field}' must be a non-empty string`);
    }
    if (engine.noFallback !== true) fail(`${where}: noFallback must be true (fail-hard, no semantic fallback)`);

    // Exact flake.lock revision/narHash agreement.
    if (flakeLock && isNonEmptyString(engine.flakeInput)) {
      const locked = flakeLock?.nodes?.[engine.flakeInput]?.locked;
      if (!locked) {
        fail(`${where}: flake.lock has no node for input '${engine.flakeInput}'`);
      } else {
        if (locked.rev !== engine.revision) {
          fail(`${where}: revision drift — manifest '${engine.revision}' != flake.lock rev '${locked.rev}' for input '${engine.flakeInput}'`);
        }
        if (locked.narHash !== engine.narHash) {
          fail(`${where}: narHash drift — manifest '${engine.narHash}' != flake.lock narHash '${locked.narHash}' for input '${engine.flakeInput}'`);
        }
      }
    }

    // Ledger engine must record embedded Plutus and prohibit a separate artifact.
    if (engine.id === "cardano-ledger-inspector") {
      const plutus = engine.embeddedPlutus;
      if (!plutus || typeof plutus !== "object") {
        fail(`${where}: embeddedPlutus record is required for the ledger engine`);
      } else {
        if (!Array.isArray(plutus.libraries) || plutus.libraries.length === 0 || !plutus.libraries.every(isNonEmptyString)) {
          fail(`${where}: embeddedPlutus.libraries must be a non-empty array of strings`);
        }
        if (plutus.separatePlutusWasiArtifact !== false) {
          fail(`${where}: embeddedPlutus.separatePlutusWasiArtifact must be false (no separate Plutus WASI artifact exists)`);
        }
      }
    }
  }

  // Completeness: every authoritative engine must be present.
  for (const id of REQUIRED_ENGINES) {
    if (!seen.has(id)) fail(`engines.json: required engine '${id}' is missing`);
  }
};

// --- Capability manifest ----------------------------------------------------

const checkCapabilities = () => {
  if (!capabilities) return;
  if (!Number.isInteger(capabilities.schemaVersion)) fail("capabilities.json: schemaVersion must be an integer");
  const knownEngineIds = new Set((engines?.engines ?? []).map((e) => e.id));
  const rows = capabilities.capabilities;
  const seen = new Set();

  if (!Array.isArray(rows) || rows.length === 0) {
    fail("capabilities.json: capabilities must be a non-empty array");
  } else {
    for (const row of rows) {
      const where = `capabilities.json row ${row?.id ?? "<no id>"}`;
      if (!isNonEmptyString(row?.id)) { fail(`${where}: id must be a non-empty string`); continue; }
      if (seen.has(row.id)) fail(`${where}: duplicate capability id '${row.id}'`);
      seen.add(row.id);
      if (!isNonEmptyString(row.operation)) fail(`${where}: operation must be a non-empty string`);
      if (typeof row.parity !== "boolean") fail(`${where}: parity must be a boolean`);

      // Shared implementation anchor: the authoritative module must be declared
      // and must declare the named symbol (declaration-aware, not a substring).
      // Shared implementation anchor. Two truthful kinds are supported:
      //   - "purescript" (default): the authoritative PureScript module must be
      //     declared and must declare the named symbol (declaration-aware).
      //   - "engine-protocol": there is no shared PureScript symbol; the row is
      //     an authoritative engine-protocol operation, and the checker proves
      //     the operation string is present in the real ledger-inspector
      //     operation set in the declared protocol source.
      const impl = row.implementation;
      if (!impl || typeof impl !== "object") {
        fail(`${where}: implementation is required`);
      } else {
        const kind = impl.kind ?? "purescript";
        if (kind === "purescript") {
          for (const field of ["module", "symbol", "source"]) {
            if (!isNonEmptyString(impl[field])) fail(`${where}: implementation.${field} must be a non-empty string`);
          }
          // The facade source must exist and reference the authoritative module.
          const facadeText = isNonEmptyString(impl.source) ? readSource(impl.source) : undefined;
          if (isNonEmptyString(impl.source) && facadeText === undefined) {
            fail(`${where}: implementation source does not exist: ${impl.source}`);
          } else if (facadeText !== undefined && isNonEmptyString(impl.module) && !facadeText.includes(impl.module)) {
            fail(`${where}: implementation source ${impl.source} does not reference module '${impl.module}'`);
          }
          // The authoritative module's own file must declare the module and the
          // named symbol (value, multi-line signature, or foreign import).
          if (isNonEmptyString(impl.module)) {
            const modulePath = moduleToPath(impl.module);
            const moduleText = readSource(modulePath);
            if (moduleText === undefined) {
              fail(`${where}: authoritative module '${impl.module}' has no source file at ${modulePath}`);
            } else {
              if (!declaresModule(moduleText, impl.module)) {
                fail(`${where}: ${modulePath} does not declare module '${impl.module}'`);
              }
              if (isNonEmptyString(impl.symbol) && !declaresSymbol(moduleText, impl.symbol)) {
                fail(`${where}: implementation symbol '${impl.symbol}' is not declared in module '${impl.module}' (${modulePath})`);
              }
            }
          }
        } else if (kind === "engine-protocol") {
          for (const field of ["operation", "protocolSource"]) {
            if (!isNonEmptyString(impl[field])) fail(`${where}: implementation.${field} must be a non-empty string for an engine-protocol implementation`);
          }
          const protocolText = isNonEmptyString(impl.protocolSource) ? readSource(impl.protocolSource) : undefined;
          if (isNonEmptyString(impl.protocolSource) && protocolText === undefined) {
            fail(`${where}: protocol source does not exist: ${impl.protocolSource}`);
          } else if (protocolText !== undefined && isNonEmptyString(impl.operation)) {
            // Prove the declared operation is a member of the real operation set
            // (a quoted "op" entry), not merely an unchecked descriptive field.
            if (!protocolText.includes(`"${impl.operation}"`)) {
              fail(`${where}: engine-protocol operation '${impl.operation}' is not present in the ledger-inspector operation set in ${impl.protocolSource}`);
            }
          }
        } else {
          fail(`${where}: implementation.kind '${kind}' must be 'purescript' or 'engine-protocol'`);
        }
      }

      // Host mappings: every parity row needs all three non-empty hosts.
      if (row.parity === true) {
        const hosts = row.hosts;
        if (!hosts || typeof hosts !== "object") {
          fail(`${where}: parity row requires a hosts object with webui, cli, and node mappings`);
        } else {
          // WebUI: a real route constructor + anchor file + a symbol/anchor
          // referenced in that file. The route must be a RouteXxx constructor
          // declared in Routing.purs and dispatched in the WebUI source; the
          // anchor symbol must be referenced as a whole word (for identifiers)
          // or as an exact quoted operation string, not an unrelated substring.
          const webui = hosts.webui;
          if (!webui || !isNonEmptyString(webui.route)) {
            fail(`${where}: missing webui host mapping (route)`);
          } else if (!isNonEmptyString(webui.anchor)) {
            fail(`${where}: missing webui host mapping (anchor)`);
          } else {
            // Prove the route constructor exists and is dispatched by the WebUI
            // router (docs/inspector/src/Main.purs), which mounts the anchor's
            // component on that route.
            const routingText = readSource("docs/inspector/src/Routing.purs");
            if (routingText === undefined) {
              fail(`${where}: cannot verify webui route; docs/inspector/src/Routing.purs is missing`);
            } else if (!new RegExp(`\\b${escapeRegExp(webui.route)}\\b`).test(routingText)) {
              fail(`${where}: webui route '${webui.route}' is not a route constructor declared in docs/inspector/src/Routing.purs`);
            }
            const routerText = readSource("docs/inspector/src/Main.purs");
            if (routerText === undefined) {
              fail(`${where}: cannot verify webui route dispatch; docs/inspector/src/Main.purs is missing`);
            } else if (!new RegExp(`\\b${escapeRegExp(webui.route)}\\b`).test(routerText)) {
              fail(`${where}: webui route '${webui.route}' is not dispatched in docs/inspector/src/Main.purs`);
            }
            const webuiText = readSource(webui.anchor);
            if (webuiText === undefined) {
              fail(`${where}: webui anchor does not exist: ${webui.anchor}`);
            } else if (!isNonEmptyString(webui.symbol)) {
              fail(`${where}: missing webui host mapping (symbol)`);
            } else if (!referencesAnchor(webuiText, webui.symbol)) {
              fail(`${where}: webui anchor '${webui.symbol}' not referenced in ${webui.anchor}`);
            }
          }
          // CLI: exact command + source + non-empty dispatch tokens routed in
          // the source, and the declared command words must agree with those
          // routing tokens so the advertised command is genuinely coupled to
          // the dispatch.
          const cli = hosts.cli;
          if (!cli || !isNonEmptyString(cli.command)) {
            fail(`${where}: missing cli host mapping (command)`);
          } else if (!isNonEmptyString(cli.source)) {
            fail(`${where}: missing cli host mapping (source)`);
          } else if (!Array.isArray(cli.tokens) || cli.tokens.length === 0 || !cli.tokens.every(isNonEmptyString)) {
            fail(`${where}: cli host mapping requires a non-empty tokens array of routing anchors`);
          } else {
            const cliText = readSource(cli.source);
            if (cliText === undefined) {
              fail(`${where}: cli source does not exist: ${cli.source}`);
            } else {
              for (const token of cli.tokens) {
                if (!cliText.includes(token)) {
                  fail(`${where}: cli command '${cli.command}' is not routed in ${cli.source} (missing token '${token}')`);
                }
              }
              // Coupling: every meaningful command word (the csk subcommands and
              // options, ignoring the leading "csk" and value placeholders) must
              // be represented in the routing tokens, proving the advertised
              // command is the one actually dispatched.
              const words = cli.command
                .split(/\s+/)
                .slice(1) // drop "csk"
                .map((w) => w.replace(/^-+/, ""))
                .filter((w) => w !== "" && !/^[A-Z][A-Z0-9_-]*$/.test(w) && !/^(P|N|HASH|PATH|HEX|INTEGER|FD|JSON|ADDRESS)$/.test(w));
              const joinedTokens = cli.tokens.join(" ");
              for (const word of words) {
                if (!joinedTokens.includes(word)) {
                  fail(`${where}: cli command word '${word}' from '${cli.command}' is not reflected in the routing tokens ${JSON.stringify(cli.tokens)}`);
                }
              }
            }
          }
          // Node: public export present in the source.
          const node = hosts.node;
          if (!node || !isNonEmptyString(node.export)) {
            fail(`${where}: missing node host mapping (export)`);
          } else if (!isNonEmptyString(node.source)) {
            fail(`${where}: missing node host mapping (source)`);
          } else {
            const nodeText = readSource(node.source);
            if (nodeText === undefined) {
              fail(`${where}: node source does not exist: ${node.source}`);
            } else if (!nodeText.includes(`export const ${node.export}`) && !nodeText.includes(`export { ${node.export} }`)) {
              fail(`${where}: node export '${node.export}' not found in ${node.source}`);
            }
          }
        }
      }

      // Authoritative engine(s). An empty set is allowed only for host-owned
      // shared I/O (provider HTTP/submission), which must say so explicitly.
      if (!Array.isArray(row.engines)) {
        fail(`${where}: engines must be an array of engine ids (possibly empty for host-owned I/O)`);
      } else {
        if (row.engines.length === 0 && !isNonEmptyString(row.engineNote)) {
          fail(`${where}: engines is empty; host-owned shared I/O rows must set engineNote explaining the absence of an authoritative engine`);
        }
        for (const id of row.engines) {
          if (!isNonEmptyString(id)) fail(`${where}: engines entries must be non-empty strings`);
          else if (knownEngineIds.size > 0 && !knownEngineIds.has(id)) {
            fail(`${where}: engines references unknown engine id '${id}'`);
          }
        }
        // Engine-attribution contract: the declared set must equal the reviewed
        // architecture mapping exactly (order-insensitive), so a wrong-but-known
        // substitution fails.
        const expected = EXPECTED_CAPABILITY_ENGINES[row.id];
        if (expected) {
          const actualSorted = [...row.engines].sort();
          const expectedSorted = [...expected].sort();
          if (JSON.stringify(actualSorted) !== JSON.stringify(expectedSorted)) {
            fail(`${where}: engine attribution ${JSON.stringify(row.engines)} does not match the reviewed architecture mapping ${JSON.stringify(expected)}`);
          }
        }
      }

      // Fixture/proof anchor.
      const proof = row.proof;
      if (!proof || !isNonEmptyString(proof.path)) {
        fail(`${where}: proof.path is required`);
      } else if (!existsSync(join(root, proof.path))) {
        fail(`${where}: proof anchor does not exist: ${proof.path}`);
      }
    }
  }

  // Completeness: the retained #70 inventory plus later parity capabilities.
  for (const id of REQUIRED_CAPABILITY_IDS) {
    if (!seen.has(id)) fail(`capabilities.json: required capability '${id}' is missing`);
  }

  // Explicit exclusions.
  if (!Array.isArray(capabilities.exclusions) || capabilities.exclusions.length === 0) {
    fail("capabilities.json: exclusions must be a non-empty array classifying deliberate non-parity surfaces");
  } else {
    for (const exclusion of capabilities.exclusions) {
      const where = `capabilities.json exclusion ${exclusion?.id ?? exclusion?.surface ?? "<no id>"}`;
      if (!isNonEmptyString(exclusion?.id)) fail(`${where}: id must be a non-empty string`);
      if (!isNonEmptyString(exclusion?.surface)) fail(`${where}: surface must be a non-empty string`);
      if (!isNonEmptyString(exclusion?.classification)) fail(`${where}: classification must be a non-empty string`);
      if (!isNonEmptyString(exclusion?.reason)) fail(`${where}: reason must be a non-empty string`);
    }
    // Completeness: required deliberate exclusions must be present and stable.
    for (const [id, surfaceFragment] of Object.entries(REQUIRED_EXCLUSIONS)) {
      const match = capabilities.exclusions.find((e) => e?.id === id);
      if (!match) {
        fail(`capabilities.json: required exclusion '${id}' is missing`);
      } else if (isNonEmptyString(surfaceFragment) && !(match.surface ?? "").includes(surfaceFragment)) {
        fail(`capabilities.json: required exclusion '${id}' surface does not mention '${surfaceFragment}'`);
      }
    }
  }
};

checkEngines();
checkCapabilities();

if (errors.length > 0) {
  for (const error of errors) console.error(`release-manifests: ${error}`);
  console.error(`release-manifests: ${errors.length} error(s)`);
  process.exit(1);
}
console.log("release-manifests: capability and engine manifests are consistent with sources and flake.lock");

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)), "..");
const checker = join(repoRoot, "scripts", "check-release-docs.mjs");
const justfile = join(repoRoot, "justfile");
const capabilitiesPath = join(repoRoot, "release", "capabilities.json");
const enginesPath = join(repoRoot, "release", "engines.json");

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    cwd: options.cwd ?? repoRoot,
    env: { ...process.env, ...(options.env ?? {}) },
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
  };
};

const runChecker = (root = repoRoot) =>
  run(process.execPath, [checker, "--root", root], { cwd: root });

const capabilities = JSON.parse(readFileSync(capabilitiesPath, "utf8"));
const engines = JSON.parse(readFileSync(enginesPath, "utf8"));

/** Build a self-contained docs tree that satisfies the release-docs contract. */
const buildGoodDocs = (root) => {
  mkdirSync(join(root, "release"), { recursive: true });
  mkdirSync(join(root, "docs", "reference"), { recursive: true });
  mkdirSync(join(root, "docs", "user"), { recursive: true });
  mkdirSync(join(root, "docs", "architecture"), { recursive: true });
  mkdirSync(join(root, "docs", "dev"), { recursive: true });

  cpSync(capabilitiesPath, join(root, "release", "capabilities.json"));
  cpSync(enginesPath, join(root, "release", "engines.json"));

  const formatImplementation = (impl) => {
    if (impl?.kind === "engine-protocol") {
      return `- Implementation kind: \`${impl.kind}\`
- Protocol operation: \`${impl.operation}\`
- Protocol source: \`${impl.protocolSource}\`
- Note: ${impl.note}`;
    }
    return `- Implementation: \`${impl.module}.${impl.symbol}\`
- Source: \`${impl.source}\``;
  };

  const capabilityBlocks = capabilities.capabilities
    .map((row) => {
      const enginesList = row.engines.join(", ");
      return `<!-- release-docs:capability:${row.id} -->
### ${row.id}

- Operation: ${row.operation}
${formatImplementation(row.implementation)}
- WebUI route: \`${row.hosts.webui.route}\`
- CLI: \`${row.hosts.cli.command}\`
- Node: \`${row.hosts.node.export}\`
- Engines: ${enginesList}
- Proof: \`${row.proof.path}\`
<!-- /release-docs:capability:${row.id} -->
`;
    })
    .join("\n");

  const engineBlocks = engines.engines
    .map((row) => {
      const plutus =
        row.embeddedPlutus == null
          ? ""
          : `
- embedded Plutus: libraries ${row.embeddedPlutus.libraries.join(", ")}
- separate Plutus WASI artifact: prohibited (${row.embeddedPlutus.separatePlutusWasiArtifact === false ? "false" : "true"})
`;
      return `<!-- release-docs:engine:${row.id} -->
### ${row.id}

- Artifact: \`${row.artifact}\`
- Source: \`${row.sourceRepository}\`
- Flake input: \`${row.flakeInput}\`
- Revision: \`${row.revision}\`
- narHash: \`${row.narHash}\`
- Owning language: ${row.owningLanguage}
- Protocol: ${row.protocolContract}
- Responsibility: ${row.responsibility}
- Packaged path: \`${row.packagedPath}\`
- Fail-hard: ${row.failHard}
- noFallback / no-fallback: hosts must not substitute semantics
${plutus}
<!-- /release-docs:engine:${row.id} -->
`;
    })
    .join("\n");

  writeFileSync(
    join(root, "docs", "reference", "capabilities.md"),
    `# Capability reference\n\n${capabilityBlocks}\n`,
  );
  writeFileSync(
    join(root, "docs", "reference", "engines.md"),
    `# Engine reference\n\n${engineBlocks}\n`,
  );

  writeFileSync(
    join(root, "docs", "installation.md"),
    `# Installation

<!-- release-docs:procedure:npm-install -->
Install the scoped public package with Node 22+:

\`\`\`bash
npm install @lambdasistemi/cardano-swiss-knife
\`\`\`
<!-- /release-docs:procedure:npm-install -->

<!-- release-docs:procedure:nix-install -->
Use the flake package attribute \`packages.csk\` (selector \`.#csk\`; conceptual
output \`packages.\${system}.csk\`) and the matching app:

\`\`\`bash
nix run .#csk -- --help
nix build .#csk
\`\`\`
<!-- /release-docs:procedure:nix-install -->
`,
  );

  writeFileSync(
    join(root, "docs", "user", "usage.md"),
    `# Usage

<!-- release-docs:procedure:cli-commands -->
CLI families:

\`\`\`bash
csk address inspect --address ADDR
csk vault list --vault PATH
csk tx inspect --cbor-hex HEX
\`\`\`
<!-- /release-docs:procedure:cli-commands -->

<!-- release-docs:procedure:node-api -->
Node API:

\`\`\`js
import { inspectAddress } from "@lambdasistemi/cardano-swiss-knife";
const inspected = await inspectAddress("addr1...");
\`\`\`
<!-- /release-docs:procedure:node-api -->

<!-- release-docs:procedure:stable-outputs -->
Stable outputs and errors: use \`--output json\` for machine-readable results.
Non-zero exit codes classify usage (2), engine, and semantic failures.
Public Node operations resolve \`CskResult\` (\`{ ok, value }\` / \`{ ok: false, error }\`).
<!-- /release-docs:procedure:stable-outputs -->
`,
  );

  writeFileSync(
    join(root, "docs", "user", "vault.md"),
    `# Offline vault CLI

<!-- release-docs:procedure:vault-migration -->
Portable vault lifecycle:

\`\`\`bash
csk vault create --out vault.age
csk vault list --vault vault.age
csk vault migrate --input old.age --out new.age
\`\`\`
<!-- /release-docs:procedure:vault-migration -->

<!-- release-docs:procedure:credentials -->
Passphrases are read from a no-echo prompt or \`--passphrase-fd\`.
They must never appear as CLI arguments or environment variables.
<!-- /release-docs:procedure:credentials -->
`,
  );

  writeFileSync(
    join(root, "docs", "user", "versions.md"),
    `# Versions and releases

<!-- release-docs:procedure:version-verify -->
Verify the single version authority in \`package.json\` against:

\`\`\`bash
csk --version
\`\`\`
CLI, Node API, WebUI footer, npm metadata, Nix metadata, tag, and GitHub release must match.
<!-- /release-docs:procedure:version-verify -->

<!-- release-docs:procedure:checksum-verify -->
Verify the universal bundle with the published \`SHA256SUMS\` file:

\`\`\`bash
sha256sum -c SHA256SUMS
\`\`\`
<!-- /release-docs:procedure:checksum-verify -->
`,
  );

  writeFileSync(
    join(root, "docs", "dev", "releasing.md"),
    `# Releasing

<!-- release-docs:procedure:release-operation -->
Tagged publication is driven by release-please. After the release PR merges,
the publish job runs \`npm publish\` for the scoped package and uploads the
universal bundle plus checksums to the GitHub release.
<!-- /release-docs:procedure:release-operation -->
`,
  );

  writeFileSync(
    join(root, "docs", "troubleshooting.md"),
    `# Troubleshooting

<!-- release-docs:procedure:troubleshooting -->
Engine load and protocol failures surface as typed \`ENGINE_*\` or
\`RDF_ENGINE_*\` errors. There is no silent semantic fallback when an engine
is missing or incompatible — fix the pin or packaging, do not reimplement.
<!-- /release-docs:procedure:troubleshooting -->
`,
  );

  writeFileSync(
    join(root, "docs", "architecture", "system.md"),
    `# System Architecture

<!-- release-docs:hazard:host-engine-boundary -->
Hosts own presentation, transport, browser storage, vault lifecycle/migration,
credentials, and orchestration. Authoritative address, ledger/transaction/
embedded Plutus, and RDF/SPARQL/SHACL semantics remain with their pinned engines.
<!-- /release-docs:hazard:host-engine-boundary -->

<!-- release-docs:hazard:semantic-drift -->
Semantic drift is a release hazard: host code must not restate ledger or crypto
rules that can diverge from the pinned engine behavior.
<!-- /release-docs:hazard:semantic-drift -->

<!-- release-docs:hazard:fail-hard-engines -->
Missing or incompatible engines fail hard with typed errors. Hosts must not
mask load, compatibility, execution, or protocol failures.
<!-- /release-docs:hazard:fail-hard-engines -->

<!-- release-docs:hazard:no-fallback -->
Silent fallback and host-side reimplementation of engine semantics are
prohibited. Prefer an explicit error over a plausible-looking substitute result.
<!-- /release-docs:hazard:no-fallback -->

<!-- release-docs:hazard:embedded-plutus -->
Plutus evaluation is embedded in wasm-tx-inspector; there is no separate Plutus
WASI artifact and hosts must not ship an alternate evaluator.
<!-- /release-docs:hazard:embedded-plutus -->
`,
  );

  writeFileSync(
    join(root, "docs", "architecture", "release-flow.md"),
    `# Release flow\n\nSee releasing for the operator path.\n`,
  );

  writeFileSync(
    join(root, "mkdocs.yml"),
    `site_name: Cardano Swiss Knife Documentation
nav:
  - Home: index.md
  - Installation: installation.md
  - Architecture:
      - System: architecture/system.md
      - Release flow: architecture/release-flow.md
  - User Manual:
      - Usage: user/usage.md
      - Offline vault CLI: user/vault.md
      - Versions and releases: user/versions.md
  - Reference:
      - Capabilities: reference/capabilities.md
      - Engines: reference/engines.md
  - Troubleshooting: troubleshooting.md
  - Developer:
      - Releasing: dev/releasing.md
`,
  );

  writeFileSync(
    join(root, "README.md"),
    `# cardano-swiss-knife

Operator manual:

- docs/installation.md
- docs/reference/capabilities.md
- docs/reference/engines.md
- docs/troubleshooting.md
`,
  );
};

const withGoodTree = (mutate) => {
  const root = mkdtempSync(join(tmpdir(), "csk-release-docs-"));
  buildGoodDocs(root);
  if (mutate) mutate(root);
  return root;
};

const rewrite = (root, relativePath, transform) => {
  const path = join(root, relativePath);
  const before = readFileSync(path, "utf8");
  writeFileSync(path, transform(before));
};

test("release-docs checker, test, and just recipe exist", () => {
  assert.ok(existsSync(checker), "scripts/check-release-docs.mjs is missing");
  assert.ok(existsSync(justfile), "justfile is missing");
  const justText = readFileSync(justfile, "utf8");
  assert.match(justText, /^release-docs:/m, "justfile must define release-docs");
  assert.match(
    justText,
    /^ci:.*\brelease-docs\b/m,
    "just ci must depend on release-docs",
  );
  assert.match(
    justText,
    /check-release-docs\.mjs/,
    "release-docs recipe must invoke the docs checker",
  );
  assert.match(
    justText,
    /release-docs\.test\.mjs/,
    "release-docs recipe must run the docs test suite",
  );
  assert.match(
    justText,
    /mkdocs build --strict/,
    "release-docs recipe must include a strict MkDocs build",
  );
});

test("checker passes on a complete synthetic operator manual", () => {
  const root = withGoodTree();
  try {
    const { status, output } = runChecker(root);
    assert.equal(status, 0, `expected synthetic good tree to pass:\n${output}`);
    assert.match(output, /release-docs: ok/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checker passes on the real operator manual tree", () => {
  // RED: fails while reference pages, procedures, hazards, and MkDocs nav are absent.
  // GREEN: passes after the operator manual is published against the manifests.
  const { status, output } = runChecker(repoRoot);
  assert.equal(
    status,
    0,
    `release-docs contract failed on the real tree:\n${output}`,
  );
  assert.match(output, /release-docs: ok/);
});

test("checker fails when a capability row is omitted from the reference page", () => {
  const victim = capabilities.capabilities[0].id;
  const root = withGoodTree((tree) => {
    rewrite(tree, "docs/reference/capabilities.md", (text) => {
      const open = `<!-- release-docs:capability:${victim} -->`;
      const close = `<!-- /release-docs:capability:${victim} -->`;
      const start = text.indexOf(open);
      const end = text.indexOf(close);
      assert.ok(start >= 0 && end > start, "fixture must contain victim block");
      return text.slice(0, start) + text.slice(end + close.length);
    });
  });
  try {
    const { status, output } = runChecker(root);
    assert.notEqual(status, 0, "checker must fail when a capability row is omitted");
    assert.match(output, new RegExp(victim));
    assert.match(output, /missing paired release-docs capability block|omits capability/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checker fails when an engine row loses fail-hard/no-fallback content", () => {
  const victim = engines.engines[0].id;
  const root = withGoodTree((tree) => {
    rewrite(tree, "docs/reference/engines.md", (text) => {
      const open = `<!-- release-docs:engine:${victim} -->`;
      const close = `<!-- /release-docs:engine:${victim} -->`;
      const start = text.indexOf(open);
      const end = text.indexOf(close);
      assert.ok(start >= 0 && end > start);
      const body = text.slice(start, end + close.length)
        .replace(engines.engines[0].failHard, "engine failures are soft")
        .replace(/noFallback|no-fallback/gi, "best-effort recovery");
      return text.slice(0, start) + body + text.slice(end + close.length);
    });
  });
  try {
    const { status, output } = runChecker(root);
    assert.notEqual(status, 0, "checker must fail when no-fallback/fail-hard content is removed");
    assert.match(output, /no-fallback|fail-hard|failHard/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checker fails when an operator procedure block is missing", () => {
  const root = withGoodTree((tree) => {
    rewrite(tree, "docs/installation.md", (text) => {
      const open = "<!-- release-docs:procedure:npm-install -->";
      const close = "<!-- /release-docs:procedure:npm-install -->";
      const start = text.indexOf(open);
      const end = text.indexOf(close);
      assert.ok(start >= 0 && end > start);
      return text.slice(0, start) + text.slice(end + close.length);
    });
  });
  try {
    const { status, output } = runChecker(root);
    assert.notEqual(status, 0, "checker must fail when npm-install procedure is missing");
    assert.match(output, /npm-install/);
    assert.match(output, /missing paired release-docs procedure block/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checker fails when engine-failure/no-fallback hazard warnings are missing", () => {
  const root = withGoodTree((tree) => {
    rewrite(tree, "docs/architecture/system.md", (text) => {
      for (const id of ["no-fallback", "fail-hard-engines"]) {
        const open = `<!-- release-docs:hazard:${id} -->`;
        const close = `<!-- /release-docs:hazard:${id} -->`;
        const start = text.indexOf(open);
        const end = text.indexOf(close);
        assert.ok(start >= 0 && end > start, `fixture must contain ${id}`);
        text = text.slice(0, start) + text.slice(end + close.length);
      }
      return text;
    });
  });
  try {
    const { status, output } = runChecker(root);
    assert.notEqual(status, 0, "checker must fail when hazard warnings are missing");
    assert.match(output, /no-fallback|fail-hard-engines/);
    assert.match(output, /missing paired release-docs hazard block/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checker fails when MkDocs navigation omits reference pages", () => {
  const root = withGoodTree((tree) => {
    rewrite(tree, "mkdocs.yml", (text) =>
      text
        .replace("      - Capabilities: reference/capabilities.md\n", "")
        .replace("      - Engines: reference/engines.md\n", "")
        .replace("  - Troubleshooting: troubleshooting.md\n", ""),
    );
  });
  try {
    const { status, output } = runChecker(root);
    assert.notEqual(status, 0, "checker must fail when MkDocs nav omits reference pages");
    assert.match(output, /reference\/capabilities\.md|reference\/engines\.md|troubleshooting\.md/);
    assert.match(output, /missing navigation entry/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checker fails when documentation invents a capability id", () => {
  const root = withGoodTree((tree) => {
    rewrite(tree, "docs/reference/capabilities.md", (text) =>
      `${text}\n<!-- release-docs:capability:FAKE-999 -->\n### FAKE-999\ninvented\n<!-- /release-docs:capability:FAKE-999 -->\n`,
    );
  });
  try {
    const { status, output } = runChecker(root);
    assert.notEqual(status, 0, "checker must fail on invented capability ids");
    assert.match(output, /FAKE-999/);
    assert.match(output, /invented capability/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checker fails when a shared-symbol implementation field is empty or missing", () => {
  const shared = capabilities.capabilities.find(
    (row) => row.implementation && !row.implementation.kind,
  );
  assert.ok(shared, "fixture must include a shared-symbol capability row");
  for (const field of ["module", "symbol", "source"]) {
    const root = withGoodTree((tree) => {
      const path = join(tree, "release", "capabilities.json");
      const doc = JSON.parse(readFileSync(path, "utf8"));
      const row = doc.capabilities.find((item) => item.id === shared.id);
      row.implementation[field] = "";
      writeFileSync(path, JSON.stringify(doc, null, 2));
    });
    try {
      const { status, output } = runChecker(root);
      assert.notEqual(
        status,
        0,
        `checker must reject empty shared-symbol implementation.${field}`,
      );
      assert.match(output, new RegExp(shared.id));
      assert.match(
        output,
        new RegExp(`implementation\\.${field}|${field}`),
      );
      assert.doesNotMatch(output, /missing required implementation.*undefined/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  const rootMissing = withGoodTree((tree) => {
    const path = join(tree, "release", "capabilities.json");
    const doc = JSON.parse(readFileSync(path, "utf8"));
    const row = doc.capabilities.find((item) => item.id === shared.id);
    delete row.implementation.module;
    delete row.implementation.symbol;
    delete row.implementation.source;
    writeFileSync(path, JSON.stringify(doc, null, 2));
  });
  try {
    const { status, output } = runChecker(rootMissing);
    assert.notEqual(
      status,
      0,
      "checker must reject missing shared-symbol implementation fields",
    );
    assert.match(output, new RegExp(shared.id));
    assert.match(output, /implementation\.(module|symbol|source)/);
    assert.doesNotMatch(output, /: undefined$/m);
  } finally {
    rmSync(rootMissing, { recursive: true, force: true });
  }
});

test("checker fails when an engine-protocol implementation field is empty or missing", () => {
  const protocol = capabilities.capabilities.find(
    (row) => row.implementation?.kind === "engine-protocol",
  );
  assert.ok(protocol, "fixture must include an engine-protocol capability row");
  for (const field of ["operation", "protocolSource", "note"]) {
    const root = withGoodTree((tree) => {
      const path = join(tree, "release", "capabilities.json");
      const doc = JSON.parse(readFileSync(path, "utf8"));
      const row = doc.capabilities.find((item) => item.id === protocol.id);
      row.implementation[field] = "";
      writeFileSync(path, JSON.stringify(doc, null, 2));
    });
    try {
      const { status, output } = runChecker(root);
      assert.notEqual(
        status,
        0,
        `checker must reject empty engine-protocol implementation.${field}`,
      );
      assert.match(output, new RegExp(protocol.id));
      assert.match(output, new RegExp(`implementation\\.${field}|${field}`));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  const rootMissing = withGoodTree((tree) => {
    const path = join(tree, "release", "capabilities.json");
    const doc = JSON.parse(readFileSync(path, "utf8"));
    const row = doc.capabilities.find((item) => item.id === protocol.id);
    delete row.implementation.operation;
    delete row.implementation.protocolSource;
    delete row.implementation.note;
    writeFileSync(path, JSON.stringify(doc, null, 2));
  });
  try {
    const { status, output } = runChecker(rootMissing);
    assert.notEqual(
      status,
      0,
      "checker must reject missing engine-protocol implementation fields",
    );
    assert.match(output, new RegExp(protocol.id));
    assert.match(
      output,
      /implementation\.(operation|protocolSource|note)|engine-protocol/,
    );
    assert.doesNotMatch(output, /Implementation: `undefined\.undefined`/);
  } finally {
    rmSync(rootMissing, { recursive: true, force: true });
  }
});

test("checker fails when docs map an engine-protocol row as undefined.undefined", () => {
  const protocol = capabilities.capabilities.find(
    (row) => row.implementation?.kind === "engine-protocol",
  );
  assert.ok(protocol, "fixture must include an engine-protocol capability row");
  const root = withGoodTree((tree) => {
    rewrite(tree, "docs/reference/capabilities.md", (text) => {
      const open = `<!-- release-docs:capability:${protocol.id} -->`;
      const close = `<!-- /release-docs:capability:${protocol.id} -->`;
      const start = text.indexOf(open);
      const end = text.indexOf(close);
      assert.ok(start >= 0 && end > start);
      const poisoned = `${open}
### ${protocol.id}

- Operation: ${protocol.operation}
- Implementation: \`undefined.undefined\`
- Source: \`undefined\`
- WebUI route: \`${protocol.hosts.webui.route}\`
- CLI: \`${protocol.hosts.cli.command}\`
- Node: \`${protocol.hosts.node.export}\`
- Engines: ${protocol.engines.join(", ")}
- Proof: \`${protocol.proof.path}\`
${close}`;
      return text.slice(0, start) + poisoned + text.slice(end + close.length);
    });
  });
  try {
    const { status, output } = runChecker(root);
    assert.notEqual(
      status,
      0,
      "checker must reject undefined.undefined engine-protocol mappings",
    );
    assert.match(output, new RegExp(protocol.id));
    assert.match(
      output,
      /engine-protocol|protocol source|implementation note|protocol operation/i,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checker fails when docs omit flakeInput, protocolContract, or responsibility", () => {
  const victim = engines.engines[0];
  assert.ok(victim.flakeInput, "fixture engine must have flakeInput");
  assert.ok(victim.protocolContract, "fixture engine must have protocolContract");
  assert.ok(victim.responsibility, "fixture engine must have responsibility");

  // Target labeled mapping lines so id-equal flakeInput values (and substrings
  // inside sourceRepository / packagedPath) are not partially scrubbed.
  const linePatterns = [
    [
      "flakeInput",
      new RegExp(
        `^- Flake input: \\\`${victim.flakeInput.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\\`\\n`,
        "m",
      ),
      /flake input/i,
    ],
    [
      "protocolContract",
      new RegExp(
        `^- Protocol: ${victim.protocolContract.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\n`,
        "m",
      ),
      /protocol contract/i,
    ],
    [
      "responsibility",
      new RegExp(
        `^- Responsibility: ${victim.responsibility.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\n`,
        "m",
      ),
      /responsibility/i,
    ],
  ];

  for (const [field, lineRe, label] of linePatterns) {
    const root = withGoodTree((tree) => {
      rewrite(tree, "docs/reference/engines.md", (text) => {
        const open = `<!-- release-docs:engine:${victim.id} -->`;
        const close = `<!-- /release-docs:engine:${victim.id} -->`;
        const start = text.indexOf(open);
        const end = text.indexOf(close);
        assert.ok(start >= 0 && end > start, "fixture must contain victim engine");
        const body = text.slice(start, end + close.length);
        assert.match(body, lineRe, `fixture must contain ${field} mapping line`);
        const scrubbed = body.replace(lineRe, "");
        assert.doesNotMatch(
          scrubbed,
          lineRe,
          `docs block must no longer contain ${field} mapping line`,
        );
        return text.slice(0, start) + scrubbed + text.slice(end + close.length);
      });
    });
    try {
      const { status, output } = runChecker(root);
      assert.notEqual(
        status,
        0,
        `checker must fail when docs omit engine ${field}`,
      );
      assert.match(output, new RegExp(victim.id));
      assert.match(output, label);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("checker fails when docs replace protocolContract or responsibility with generic prose", () => {
  const victim = engines.engines[0];
  const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const substitutions = [
    {
      field: "protocolContract",
      lineRe: new RegExp(
        `^(- Protocol: )${escape(victim.protocolContract)}$`,
        "m",
      ),
      replacement: "$1loads somehow at runtime",
      exact: victim.protocolContract,
      label: /protocol contract/i,
    },
    {
      field: "responsibility",
      lineRe: new RegExp(
        `^(- Responsibility: )${escape(victim.responsibility)}$`,
        "m",
      ),
      replacement: "$1handles various cardano things",
      exact: victim.responsibility,
      label: /responsibility/i,
    },
    {
      field: "flakeInput",
      lineRe: new RegExp(
        `^(- Flake input: \\\`)${escape(victim.flakeInput)}(\\\`)$`,
        "m",
      ),
      replacement: "$1some-other-input$2",
      exact: victim.flakeInput,
      label: /flake input/i,
    },
  ];

  for (const { field, lineRe, replacement, exact, label } of substitutions) {
    const root = withGoodTree((tree) => {
      rewrite(tree, "docs/reference/engines.md", (text) => {
        const open = `<!-- release-docs:engine:${victim.id} -->`;
        const close = `<!-- /release-docs:engine:${victim.id} -->`;
        const start = text.indexOf(open);
        const end = text.indexOf(close);
        assert.ok(start >= 0 && end > start);
        const body = text.slice(start, end + close.length);
        assert.match(body, lineRe, `fixture must contain ${field} mapping line`);
        const poisoned = body.replace(lineRe, replacement);
        // flakeInput also appears as the engine id/title; only the labeled
        // mapping line may change, so assert the authority value is gone from
        // that line rather than the whole block for id-equal flake inputs.
        if (field === "flakeInput") {
          assert.match(poisoned, /^- Flake input: `some-other-input`$/m);
          assert.doesNotMatch(
            poisoned,
            new RegExp(`^- Flake input: \\\`${escape(exact)}\\\`$`, "m"),
          );
        } else {
          assert.ok(
            !poisoned.includes(exact),
            `docs must substitute generic prose for ${field}`,
          );
        }
        return text.slice(0, start) + poisoned + text.slice(end + close.length);
      });
    });
    try {
      const { status, output } = runChecker(root);
      assert.notEqual(
        status,
        0,
        `checker must reject generic prose in place of exact ${field}`,
      );
      assert.match(output, new RegExp(victim.id));
      assert.match(output, label);
      // Exact authority value must be what was required, not the generic substitute.
      assert.match(output, new RegExp(escape(exact)));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("checker fails when engine authority fields are empty or missing in the manifest", () => {
  const victim = engines.engines[0];
  for (const field of ["flakeInput", "protocolContract", "responsibility"]) {
    const rootEmpty = withGoodTree((tree) => {
      const path = join(tree, "release", "engines.json");
      const doc = JSON.parse(readFileSync(path, "utf8"));
      const row = doc.engines.find((item) => item.id === victim.id);
      row[field] = "";
      writeFileSync(path, JSON.stringify(doc, null, 2));
    });
    try {
      const { status, output } = runChecker(rootEmpty);
      assert.notEqual(
        status,
        0,
        `checker must reject empty engines.json ${field}`,
      );
      assert.match(output, new RegExp(victim.id));
      assert.match(
        output,
        /missing or empty|flake input|protocol contract|responsibility/i,
      );
      assert.doesNotMatch(output, /: undefined$/m);
    } finally {
      rmSync(rootEmpty, { recursive: true, force: true });
    }

    const rootMissing = withGoodTree((tree) => {
      const path = join(tree, "release", "engines.json");
      const doc = JSON.parse(readFileSync(path, "utf8"));
      const row = doc.engines.find((item) => item.id === victim.id);
      delete row[field];
      writeFileSync(path, JSON.stringify(doc, null, 2));
    });
    try {
      const { status, output } = runChecker(rootMissing);
      assert.notEqual(
        status,
        0,
        `checker must reject missing engines.json ${field}`,
      );
      assert.match(output, new RegExp(victim.id));
      assert.match(
        output,
        /missing or empty|flake input|protocol contract|responsibility/i,
      );
      assert.doesNotMatch(output, /: undefined$/m);
    } finally {
      rmSync(rootMissing, { recursive: true, force: true });
    }
  }
});

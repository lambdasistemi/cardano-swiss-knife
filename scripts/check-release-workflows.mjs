#!/usr/bin/env node
// Static release-workflow contract checker for cardano-swiss-knife.
//
// Structurally parses workflow YAML (jobs/steps/order) and proves:
// - Release Please publication is gated on release_created
// - Publish runs on a GitHub-hosted runner with explicit Nix+Cachix setup
//   (required for npm provenance OIDC)
// - Exact tag checkout, Node 22, version/package proofs before any external write
// - npm publish with public+provenance and GitHub upload of the release-bundle
//   archive plus SHA256SUMS only
// - Least-privilege GITHUB_TOKEN: no broad workflow-global write/OIDC;
//   id-token: write only on the hosted publish job; App tokens scoped via
//   permission-contents / permission-pull-requests inputs
// - CI Node 22 three-OS smokes discover a single downloaded tarball dynamically
// - Pages accepts only an explicit v* tag path (push tag or dispatch input)
//
// Usage:
//   check-release-workflows.mjs [--repo-root DIR]

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const option = (name) => {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
};

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(option("--repo-root") ?? join(scriptDir, ".."));

const errors = [];
const fail = (message) => errors.push(message);

const readText = (relativePath) => {
  const path = join(repoRoot, relativePath);
  if (!existsSync(path)) {
    fail(`missing workflow file: ${relativePath}`);
    return undefined;
  }
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    fail(`failed to read ${relativePath}: ${error.message}`);
    return undefined;
  }
};

// ---------------------------------------------------------------------------
// Structural YAML: prefer project yq tooling; fall back to a GHA-subset parser.
// ---------------------------------------------------------------------------

const parseWithYq = (text) => {
  const result = spawnSync("yq", ["-o=json", "."], {
    input: text,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.status !== 0) return undefined;
  try {
    return JSON.parse(result.stdout);
  } catch {
    return undefined;
  }
};

/** Minimal indented YAML parser for GitHub Actions workflow documents. */
const parseYamlSubset = (source) => {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  let i = 0;

  const peek = () => (i < lines.length ? lines[i] : null);
  const rawIndent = (line) => {
    if (line === null) return 0;
    const match = /^( *)/.exec(line);
    return match ? match[1].length : 0;
  };
  const isBlankOrComment = (line) =>
    line === null || line.trim() === "" || line.trimStart().startsWith("#");

  const skipBlank = () => {
    while (i < lines.length && isBlankOrComment(lines[i])) i += 1;
  };

  const parseScalar = (raw) => {
    const value = raw.trim();
    if (value === "" || value === "null" || value === "~") return null;
    if (value === "true") return true;
    if (value === "false") return false;
    if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      return value.slice(1, -1);
    }
    // Inline flow sequence: [a, b]
    if (value.startsWith("[") && value.endsWith("]")) {
      const inner = value.slice(1, -1).trim();
      if (inner === "") return [];
      return inner.split(",").map((part) => parseScalar(part));
    }
    // Inline flow map: {k: v} — rare; keep as string if complex.
    if (value.startsWith("{") && value.endsWith("}")) {
      return value;
    }
    return value;
  };

  const parseBlockScalar = (indent) => {
    const chunks = [];
    while (i < lines.length) {
      const line = lines[i];
      if (line.trim() === "") {
        chunks.push("");
        i += 1;
        continue;
      }
      if (rawIndent(line) <= indent && line.trim() !== "") break;
      chunks.push(line.slice(Math.min(rawIndent(line), indent + 2)));
      i += 1;
    }
    return chunks.join("\n").replace(/\n+$/, "\n");
  };

  const parseValue = (indent, inline) => {
    if (inline !== undefined && inline !== "") {
      const trimmed = inline.trim();
      if (trimmed === "|" || trimmed === ">" || trimmed.startsWith("|") || trimmed.startsWith(">")) {
        i += 1;
        return parseBlockScalar(indent);
      }
      return parseScalar(inline);
    }
    skipBlank();
    const line = peek();
    if (line === null) return null;
    const nextIndent = rawIndent(line);
    if (nextIndent <= indent) return null;
    const trimmed = line.trim();
    if (trimmed.startsWith("- ")) return parseSequence(nextIndent);
    return parseMapping(nextIndent);
  };

  const parseSequence = (indent) => {
    const items = [];
    while (i < lines.length) {
      skipBlank();
      const line = peek();
      if (line === null) break;
      const ind = rawIndent(line);
      if (ind < indent) break;
      if (ind > indent) {
        // nested content belonging to previous item — should not start a sequence here
        break;
      }
      const trimmed = line.trim();
      if (!trimmed.startsWith("-")) break;
      const rest = trimmed.slice(1).trimStart();
      i += 1;
      if (rest === "") {
        items.push(parseValue(indent, undefined));
      } else if (rest.includes(":") && !rest.startsWith('"') && !rest.startsWith("'")) {
        // Inline key on the dash line: - name: Checkout
        const colon = rest.indexOf(":");
        const key = rest.slice(0, colon).trim();
        const after = rest.slice(colon + 1);
        const obj = {};
        if (after.trim() === "" || after.trim() === "|" || after.trim().startsWith("|") || after.trim().startsWith(">")) {
          obj[key] = parseValue(indent, after);
        } else {
          obj[key] = parseScalar(after);
        }
        // Continue mapping keys at indent+2 under this sequence item
        Object.assign(obj, parseMapping(indent + 2, true) ?? {});
        // parseMapping advances; merge only remaining keys at item level
        items.push(obj);
      } else {
        items.push(parseScalar(rest));
      }
    }
    return items;
  };

  const parseMapping = (indent, resume = false) => {
    const obj = {};
    while (i < lines.length) {
      skipBlank();
      const line = peek();
      if (line === null) break;
      const ind = rawIndent(line);
      if (ind < indent) break;
      if (ind > indent && !resume) {
        // deeper content without a key — stop
        break;
      }
      if (ind > indent) break;
      const trimmed = line.trim();
      if (trimmed.startsWith("- ")) break;
      const colon = trimmed.indexOf(":");
      if (colon < 0) {
        i += 1;
        continue;
      }
      const key = trimmed.slice(0, colon).trim();
      const after = trimmed.slice(colon + 1);
      i += 1;
      if (after.trim() === "") {
        // Nested value: sequence or mapping
        skipBlank();
        const next = peek();
        if (next !== null && rawIndent(next) > indent) {
          const nextTrim = next.trim();
          if (nextTrim.startsWith("- ")) {
            obj[key] = parseSequence(rawIndent(next));
          } else {
            obj[key] = parseMapping(rawIndent(next));
          }
        } else {
          obj[key] = null;
        }
      } else {
        const trimmedAfter = after.trim();
        if (
          trimmedAfter === "|" ||
          trimmedAfter === ">" ||
          trimmedAfter.startsWith("|") ||
          trimmedAfter.startsWith(">")
        ) {
          obj[key] = parseBlockScalar(indent);
        } else {
          obj[key] = parseScalar(after);
        }
      }
    }
    return obj;
  };

  skipBlank();
  return parseMapping(0);
};

const parseWorkflow = (raw, label) => {
  if (raw === undefined) return undefined;
  const viaYq = parseWithYq(raw);
  if (viaYq && typeof viaYq === "object") return viaYq;
  try {
    const parsed = parseYamlSubset(raw);
    if (parsed && typeof parsed === "object") return parsed;
  } catch (error) {
    fail(`${label}: YAML parse failed: ${error.message}`);
    return undefined;
  }
  fail(`${label}: could not structurally parse workflow YAML`);
  return undefined;
};

// ---------------------------------------------------------------------------
// Structural helpers over parsed jobs/steps
// ---------------------------------------------------------------------------

const asArray = (value) => {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
};

const stepText = (step) => {
  if (!step || typeof step !== "object") return "";
  const parts = [
    step.name,
    step.uses,
    step.id,
    step.if,
    step.shell,
    typeof step.run === "string" ? step.run : "",
    step.with ? JSON.stringify(step.with) : "",
    step.env ? JSON.stringify(step.env) : "",
  ];
  return parts.filter(Boolean).join("\n");
};

const stepIndexWhere = (steps, predicate) => {
  for (let i = 0; i < steps.length; i += 1) {
    if (predicate(steps[i], i)) return i;
  }
  return -1;
};

const allStepIndexesWhere = (steps, predicate) => {
  const indexes = [];
  for (let i = 0; i < steps.length; i += 1) {
    if (predicate(steps[i], i)) indexes.push(i);
  }
  return indexes;
};

const isGithubHostedRunner = (runsOn) => {
  const values = asArray(runsOn).map(String);
  if (values.length === 0) return false;
  // Self-hosted / org labels are not GitHub-hosted.
  if (values.some((v) => /nixos|self-hosted/i.test(v))) return false;
  return values.some((v) =>
    /^(ubuntu|macos|windows)-(latest|\d+)/i.test(v),
  );
};

const hasNixSetupStep = (steps) =>
  steps.some((step) => {
    const uses = String(step.uses ?? "");
    return (
      /paolino\/dev-assets\/setup-nix@/.test(uses) ||
      /cachix\/install-nix-action@/.test(uses)
    );
  });

const hasCachixConfigured = (steps) =>
  steps.some((step) => {
    const uses = String(step.uses ?? "");
    const text = stepText(step);
    if (/paolino\/dev-assets\/setup-nix@/.test(uses)) {
      return /cachix-auth-token|CACHIX_AUTH_TOKEN/.test(text);
    }
    if (/cachix\/cachix-action@/.test(uses)) return true;
    return false;
  });

// ---------------------------------------------------------------------------
// release.yml
// ---------------------------------------------------------------------------

/** True when a permission map grants write (or broader) for the named key. */
const permissionIsWrite = (perms, key) => {
  if (!perms || typeof perms !== "object") return false;
  const value = String(perms[key] ?? "").toLowerCase();
  return value === "write";
};

/**
 * Locate create-github-app-token steps and require supported permission-*
 * scoping inputs. `required` maps input name → required value (e.g. write).
 */
const requireScopedAppToken = (jobId, steps, required) => {
  const mintSteps = asArray(steps).filter((s) =>
    /create-github-app-token@/.test(String(s.uses ?? "")),
  );
  if (mintSteps.length === 0) {
    fail(`${jobId} must mint a GitHub App token`);
    return;
  }
  for (const step of mintSteps) {
    const withInputs = step.with && typeof step.with === "object" ? step.with : {};
    const hasAnyPermissionInput = Object.keys(withInputs).some((k) =>
      k.startsWith("permission-"),
    );
    if (!hasAnyPermissionInput) {
      fail(
        `${jobId} App-token mint must scope permissions via permission-* inputs (unscoped tokens inherit full installation access)`,
      );
      continue;
    }
    for (const [input, want] of Object.entries(required)) {
      const got = String(withInputs[input] ?? "").toLowerCase();
      if (got !== String(want).toLowerCase()) {
        fail(
          `${jobId} App-token mint must set ${input}: ${want} (got ${got || "missing"})`,
        );
      }
    }
    // Secrets only as action inputs — never echo private-key / tokens in run steps.
    const privateKey = String(withInputs["private-key"] ?? "");
    if (privateKey && !/\$\{\{\s*secrets\./.test(privateKey)) {
      fail(
        `${jobId} App-token private-key must be passed as a secrets.* action input`,
      );
    }
  }
};

const checkReleaseWorkflow = (doc) => {
  if (doc === undefined) return;
  const jobs = doc.jobs ?? {};

  // Workflow-global GITHUB_TOKEN: reject broad write/OIDC grants.
  const topPerms = doc.permissions;
  if (topPerms && typeof topPerms === "object") {
    if (permissionIsWrite(topPerms, "contents")) {
      fail(
        "release.yml must not grant workflow-global contents: write (use job-level App-token scopes instead)",
      );
    }
    if (permissionIsWrite(topPerms, "pull-requests")) {
      fail(
        "release.yml must not grant workflow-global pull-requests: write",
      );
    }
    if (permissionIsWrite(topPerms, "id-token")) {
      fail(
        "release.yml must not grant workflow-global id-token: write (OIDC belongs only on the hosted publish job)",
      );
    }
  }

  const releasePlease =
    jobs["release-please"] ??
    Object.entries(jobs).find(([id]) => /release-please/i.test(id))?.[1];
  if (!releasePlease) {
    fail("release.yml must define a release-please job");
    return;
  }

  const outputs = releasePlease.outputs ?? {};
  if (!outputs.release_created || !/steps\.[A-Za-z0-9_-]+\.outputs\.release_created/.test(String(outputs.release_created))) {
    fail("release-please job must export outputs.release_created from the action step");
  }
  if (!outputs.tag_name || !/steps\.[A-Za-z0-9_-]+\.outputs\.tag_name/.test(String(outputs.tag_name))) {
    fail("release-please job must export outputs.tag_name from the action step");
  }

  const rpSteps = asArray(releasePlease.steps);
  if (!rpSteps.some((s) => /googleapis\/release-please-action@/.test(String(s.uses ?? "")))) {
    fail("release-please job must run googleapis/release-please-action");
  }
  // Release Please needs contents + pull-requests write on the App token.
  requireScopedAppToken("release-please", rpSteps, {
    "permission-contents": "write",
    "permission-pull-requests": "write",
  });

  // release-please job must not need id-token (no npm provenance there).
  const rpJobPerms = releasePlease.permissions;
  if (permissionIsWrite(rpJobPerms, "id-token")) {
    fail(
      "release-please job must not request id-token: write (OIDC is only for hosted npm provenance publish)",
    );
  }
  // Prefer no GITHUB_TOKEN write on release-please (writes go through App token).
  if (permissionIsWrite(rpJobPerms, "contents") || permissionIsWrite(rpJobPerms, "pull-requests")) {
    fail(
      "release-please job must not grant GITHUB_TOKEN contents/pull-requests write (authenticate via scoped App token)",
    );
  }

  const publishEntries = Object.entries(jobs).filter(([id, job]) => {
    if (id === "release-please" || /release-please/i.test(id)) return false;
    const ifExpr = String(job.if ?? "");
    return /release_created/.test(ifExpr);
  });
  if (publishEntries.length === 0) {
    fail(
      "release.yml must define a publication job gated on needs.release-please.outputs.release_created",
    );
    return;
  }

  for (const [id, job] of publishEntries) {
    const needs = asArray(job.needs).map(String);
    if (!needs.includes("release-please")) {
      fail(`publication job ${id} must need release-please`);
    }
    if (!/needs\.release-please\.outputs\.release_created/.test(String(job.if ?? ""))) {
      fail(`publication job ${id} must gate on needs.release-please.outputs.release_created`);
    }

    if (!isGithubHostedRunner(job["runs-on"])) {
      fail(
        `publication job ${id} must run on a GitHub-hosted runner (npm provenance requires hosted OIDC; got ${JSON.stringify(job["runs-on"])})`,
      );
    }

    // Job-level OIDC for npm provenance — not inherited from broad workflow scope.
    const jobPerms = job.permissions;
    if (!permissionIsWrite(jobPerms, "id-token")) {
      fail(
        `publication job ${id} must set job-level permissions id-token: write for npm provenance OIDC`,
      );
    }
    // GITHUB_TOKEN should not need contents write on publish (App token uploads).
    if (permissionIsWrite(jobPerms, "contents") || permissionIsWrite(jobPerms, "pull-requests")) {
      fail(
        `publication job ${id} must not grant GITHUB_TOKEN contents/pull-requests write (use scoped App token for GitHub writes)`,
      );
    }

    const steps = asArray(job.steps);
    if (steps.length === 0) {
      fail(`publication job ${id} must define steps`);
      continue;
    }

    // Publish App token: contents write for exact-tag checkout + gh release upload.
    requireScopedAppToken(`publication job ${id}`, steps, {
      "permission-contents": "write",
    });
    // Publish must not request pull-requests on the App token (release-please only).
    for (const step of steps.filter((s) =>
      /create-github-app-token@/.test(String(s.uses ?? "")),
    )) {
      const withInputs = step.with && typeof step.with === "object" ? step.with : {};
      if (Object.prototype.hasOwnProperty.call(withInputs, "permission-pull-requests")) {
        fail(
          `publication job ${id} App-token mint must not request permission-pull-requests (publication only needs contents write)`,
        );
      }
    }

    const checkoutIdx = stepIndexWhere(
      steps,
      (s) => /actions\/checkout@/.test(String(s.uses ?? "")),
    );
    if (checkoutIdx < 0) {
      fail(`publication job ${id} must checkout the repository`);
    } else {
      const ref = String(steps[checkoutIdx].with?.ref ?? "");
      if (!/needs\.release-please\.outputs\.tag_name/.test(ref)) {
        fail(
          `publication job ${id} must checkout ref needs.release-please.outputs.tag_name`,
        );
      }
    }

    const nodeIdx = stepIndexWhere(
      steps,
      (s) => /actions\/setup-node@/.test(String(s.uses ?? "")),
    );
    if (nodeIdx < 0) {
      fail(`publication job ${id} must set up Node`);
    } else {
      const version = String(steps[nodeIdx].with?.["node-version"] ?? "");
      if (!/^22(\.0)?$/.test(version) && version !== "22") {
        // accept 22 as number or string
        if (Number(version) !== 22) {
          fail(`publication job ${id} must use Node 22`);
        }
      }
    }

    if (!hasNixSetupStep(steps)) {
      fail(
        `publication job ${id} must explicitly install/configure Nix on the hosted runner (paolino/dev-assets/setup-nix or cachix/install-nix-action)`,
      );
    }
    if (!hasCachixConfigured(steps)) {
      fail(
        `publication job ${id} must configure Cachix (auth token) before building Nix artifacts`,
      );
    }

    const nixSetupIdx = stepIndexWhere(steps, (s) => {
      const uses = String(s.uses ?? "");
      return (
        /paolino\/dev-assets\/setup-nix@/.test(uses) ||
        /cachix\/install-nix-action@/.test(uses) ||
        /cachix\/cachix-action@/.test(uses)
      );
    });
    const buildIdx = stepIndexWhere(steps, (s) =>
      /nix build/.test(stepText(s)),
    );
    if (buildIdx < 0) {
      fail(`publication job ${id} must build node-package and/or release-bundle`);
    } else if (nixSetupIdx >= 0 && !(nixSetupIdx < buildIdx)) {
      fail(
        `publication job ${id} must install/configure Nix+Cachix before building artifacts`,
      );
    }
    if (buildIdx >= 0) {
      const buildText = stepText(steps[buildIdx]);
      if (!/#node-package|node-package/.test(buildText) || !/#release-bundle|release-bundle/.test(buildText)) {
        // Require both artifacts to be built somewhere before publish.
        const allBuildText = steps.map(stepText).join("\n");
        if (!/nix build[^\n]*node-package|#node-package/.test(allBuildText)) {
          fail(`publication job ${id} must build node-package`);
        }
        if (!/nix build[^\n]*release-bundle|#release-bundle/.test(allBuildText)) {
          fail(`publication job ${id} must build release-bundle`);
        }
      }
    }

    // Local proofs: package + version (with artifacts) must exist as steps.
    const packageProofIndexes = allStepIndexesWhere(steps, (s) =>
      /check-release-package\.mjs/.test(stepText(s)),
    );
    const versionProofIndexes = allStepIndexesWhere(steps, (s) =>
      /check-release-version\.mjs/.test(stepText(s)),
    );
    if (packageProofIndexes.length === 0) {
      fail(`publication job ${id} must run check-release-package.mjs`);
    }
    if (versionProofIndexes.length === 0) {
      fail(
        `publication job ${id} must verify the tag equals v\${package.json version} via check-release-version.mjs`,
      );
    }
    // Final artifact-aware version proof: check-release-version with package/bundle args.
    const finalVersionProofIdx = stepIndexWhere(steps, (s) => {
      const text = stepText(s);
      return (
        /check-release-version\.mjs/.test(text) &&
        /--node-package|--release-bundle|--csk/.test(text)
      );
    });
    if (finalVersionProofIdx < 0) {
      fail(
        `publication job ${id} must run a final check-release-version proof against built package/bundle artifacts`,
      );
    }

    const npmIdx = stepIndexWhere(steps, (s) => /npm publish/.test(stepText(s)));
    const ghIdx = stepIndexWhere(
      steps,
      (s) =>
        /gh release upload/.test(stepText(s)) ||
        /softprops\/action-gh-release@/.test(String(s.uses ?? "")),
    );

    if (npmIdx < 0) {
      fail(`publication job ${id} must publish the scoped npm tarball`);
    } else {
      const npmText = stepText(steps[npmIdx]);
      if (!/--access\s+public|access.*public/.test(npmText)) {
        fail(`publication job ${id} must publish with public access`);
      }
      if (!/--provenance|provenance/.test(npmText)) {
        fail(`publication job ${id} must publish with provenance`);
      }
      if (!/NODE_AUTH_TOKEN|NPM_TOKEN/.test(npmText)) {
        fail(`publication job ${id} must use the repository npm secret`);
      }
    }

    if (ghIdx < 0) {
      fail(`publication job ${id} must attach artifacts to the GitHub release`);
    } else {
      const uploadText = stepText(steps[ghIdx]);
      // Bind upload to the built release-bundle archive and SHA256SUMS.
      if (!/release-bundle\/.+\.tgz|release-bundle\/\*\.tgz|release-bundle\/[^ \n]+/.test(uploadText)) {
        fail(
          `publication job ${id} must upload the built release-bundle archive (release-bundle/*.tgz)`,
        );
      }
      if (!/release-bundle\/SHA256SUMS|SHA256SUMS/.test(uploadText)) {
        fail(
          `publication job ${id} must upload checksum evidence (release-bundle/SHA256SUMS)`,
        );
      }
      // Reject uploads that only ship unrelated assets (no release-bundle binding).
      const uploadRun = String(steps[ghIdx].run ?? uploadText);
      const assetTokens = uploadRun
        .split(/\s+/)
        .filter((tok) => tok && !tok.startsWith("-") && !tok.startsWith("$") && !tok.startsWith('"') && tok !== "gh" && tok !== "release" && tok !== "upload");
      // If gh release upload is present, require both required assets appear as args.
      if (!/release-bundle\/\*?.+\.tgz|release-bundle\/\*\.tgz/.test(uploadRun) && !/release-bundle\/.+\.tgz/.test(uploadRun)) {
        // already covered above; keep structural
      }
      // Unrelated-only upload: has gh release upload but missing either required asset.
      const hasBundleArchive =
        /release-bundle\/\*\.tgz/.test(uploadRun) ||
        /release-bundle\/[A-Za-z0-9._*-]+\.tgz/.test(uploadRun);
      const hasChecksums = /release-bundle\/SHA256SUMS|\bSHA256SUMS\b/.test(uploadRun);
      if (!hasBundleArchive || !hasChecksums) {
        fail(
          `publication job ${id} GitHub upload must bind to release-bundle archive and SHA256SUMS (reject unrelated-only uploads)`,
        );
      }
      if (!/steps\.app-token\.outputs\.token|create-github-app-token@/.test(uploadText + steps.map(stepText).join("\n"))) {
        fail(
          `publication job ${id} must use the minted GitHub App token for GitHub writes`,
        );
      }
      void assetTokens;
    }

    // Every local proof and the build must precede BOTH external writes.
    const firstExternal = [npmIdx, ghIdx].filter((n) => n >= 0).sort((a, b) => a - b)[0];
    if (firstExternal === undefined) {
      fail(`publication job ${id} must both build release artifacts and publish them`);
    } else {
      if (buildIdx >= 0 && !(buildIdx < firstExternal)) {
        fail(
          `publication job ${id} must build artifacts before any external publish/upload step`,
        );
      }
      for (const idx of packageProofIndexes) {
        if (!(idx < firstExternal)) {
          fail(
            `publication job ${id} must run check-release-package before any external publish/upload step`,
          );
        }
      }
      for (const idx of versionProofIndexes) {
        if (!(idx < firstExternal)) {
          fail(
            `publication job ${id} must run check-release-version before any external publish/upload step`,
          );
        }
      }
      if (finalVersionProofIdx >= 0 && !(finalVersionProofIdx < firstExternal)) {
        fail(
          `publication job ${id} must finish artifact version proofs before any external publish/upload step`,
        );
      }
    }
  }
};

// ---------------------------------------------------------------------------
// ci.yml
// ---------------------------------------------------------------------------

const checkCiWorkflow = (doc) => {
  if (doc === undefined) return;
  const jobs = doc.jobs ?? {};
  const smoke =
    jobs["node-package-smoke"] ??
    Object.entries(jobs).find(([id]) => /node-package-smoke|package-smoke/i.test(id))?.[1];
  if (!smoke) {
    fail("ci.yml must define a node-package-smoke job");
    return;
  }

  const runsOn = String(smoke["runs-on"] ?? "");
  const matrixOs = smoke.strategy?.matrix?.os;
  const osList = asArray(matrixOs).map(String);
  const haystack = [runsOn, ...osList].join(" ");

  for (const os of ["ubuntu-latest", "macos-latest", "windows-latest"]) {
    if (!haystack.includes(os)) {
      fail(`node-package-smoke must include ${os}`);
    }
  }

  const steps = asArray(smoke.steps);
  const nodeStep = steps.find((s) => /actions\/setup-node@/.test(String(s.uses ?? "")));
  const nodeVersion = String(
    nodeStep?.with?.["node-version"] ?? smoke.strategy?.matrix?.["node-version"] ?? "",
  );
  if (Number(nodeVersion) !== 22 && nodeVersion !== "22") {
    fail("node-package-smoke must use Node 22");
  }

  const smokeText = steps.map(stepText).join("\n");
  const hardCoded = smokeText.match(
    /[A-Za-z0-9._-]+-\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?\.tgz/,
  );
  if (hardCoded) {
    fail(
      `node-package-smoke must not hard-code a versioned tarball name (found ${hardCoded[0]})`,
    );
  }

  if (!/\*\.tgz|find .*tgz|readdir|nullglob|tarballs=/.test(smokeText)) {
    fail(
      "node-package-smoke must discover the downloaded *.tgz artifact dynamically",
    );
  }
  if (
    !/ne 1|!= 1|-ne 1|length -ne 1|length !== 1|=== 1|== 1|exactly one/.test(
      smokeText,
    )
  ) {
    fail(
      "node-package-smoke must fail when zero or multiple *.tgz artifacts are present",
    );
  }
  if (!/CSK_PACKAGE_TARBALL/.test(smokeText)) {
    fail("node-package-smoke must set CSK_PACKAGE_TARBALL to the discovered tarball");
  }
};

// ---------------------------------------------------------------------------
// pages.yml
// ---------------------------------------------------------------------------

const checkPagesWorkflow = (doc, raw) => {
  if (doc === undefined) return;
  const on = doc.on ?? doc.true ?? {};
  // YAML parsers may key `on` as true (boolean) — recover from raw if needed.
  let triggers = on;
  if (!triggers || typeof triggers !== "object" || Array.isArray(triggers)) {
    // Fallback: re-parse focus — yq keeps "on" as key in JSON.
    triggers = doc.on ?? {};
  }

  const dispatch = triggers.workflow_dispatch;
  if (dispatch === undefined) {
    fail("pages.yml must allow workflow_dispatch");
  } else {
    const inputs =
      dispatch && typeof dispatch === "object" ? dispatch.inputs ?? {} : null;
    if (!inputs || typeof inputs !== "object" || !inputs.tag) {
      fail(
        "pages.yml workflow_dispatch must declare a required tag input (so default-branch dispatch cannot use --tag main)",
      );
    } else {
      const tagInput = inputs.tag;
      if (tagInput && typeof tagInput === "object" && tagInput.required === false) {
        fail("pages.yml workflow_dispatch tag input must be required");
      }
    }
  }

  const jobs = doc.jobs ?? {};
  const build =
    jobs.build ??
    Object.entries(jobs).find(([id]) => /build/i.test(id))?.[1] ??
    Object.values(jobs)[0];
  if (!build) {
    fail("pages.yml must define a build job");
    return;
  }

  const steps = asArray(build.steps);
  const allText = steps.map(stepText).join("\n");

  // Explicit resolve path: must not rely solely on github.ref_name for the
  // check when dispatch is enabled; require inputs.tag handling and v* guard.
  if (!/inputs\.tag|github\.event\.inputs\.tag/.test(allText)) {
    fail(
      "pages.yml must use the workflow_dispatch tag input when resolving the publish ref",
    );
  }
  if (!/workflow_dispatch/.test(allText) && !/github\.event_name/.test(allText)) {
    fail(
      "pages.yml must branch on event type (push tag vs workflow_dispatch) when resolving the publish ref",
    );
  }
  // Reject bare main / non-v* refs.
  if (!/v\*|case .*v\*|release tag|v\* release/.test(allText) && !/case "\$TAG"/.test(allText)) {
    // Accept either a shell case on v* or explicit documentation in the step.
    if (!/v\*\)/.test(allText) && !/startsWith\(['\"]v/.test(allText)) {
      fail(
        "pages.yml must reject non-v* refs so dispatch cannot publish stale branch artifacts",
      );
    }
  }

  if (!/check-release-version\.mjs/.test(allText)) {
    fail("pages.yml must verify tag/package version agreement before publication");
  }
  if (!/--tag/.test(allText)) {
    fail("pages.yml must verify the tag is exactly v${package.json version}");
  }

  // Checkout must target the resolved tag, not an arbitrary branch tip.
  const checkout = steps.find((s) => /actions\/checkout@/.test(String(s.uses ?? "")));
  if (!checkout) {
    fail("pages.yml must checkout the repository at the release tag");
  } else {
    const ref = String(checkout.with?.ref ?? "");
    if (!ref || /github\.ref_name/.test(ref) && !/release-tag|inputs\.tag|steps\./.test(ref + allText)) {
      // Allow checkout ref from a prior resolve step output.
      if (!/steps\.[A-Za-z0-9_-]+\.outputs\./.test(ref) && !/inputs\.tag/.test(ref)) {
        fail(
          "pages.yml checkout must use the resolved release tag (not a default-branch tip)",
        );
      }
    }
  }

  // Tag verification step must use resolved tag output/input, not only github.ref_name.
  const versionStep = steps.find((s) => /check-release-version\.mjs/.test(stepText(s)));
  if (versionStep) {
    const vText = stepText(versionStep);
    if (
      /github\.ref_name/.test(vText) &&
      !/steps\.[A-Za-z0-9_-]+\.outputs\./.test(vText) &&
      !/inputs\.tag/.test(vText)
    ) {
      fail(
        "pages.yml must not pass github.ref_name alone to check-release-version (breaks workflow_dispatch on non-tag refs)",
      );
    }
  }

  void raw;
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const releaseRaw = readText(".github/workflows/release.yml");
const ciRaw = readText(".github/workflows/ci.yml");
const pagesRaw = readText(".github/workflows/pages.yml");

const releaseDoc = parseWorkflow(releaseRaw, "release.yml");
const ciDoc = parseWorkflow(ciRaw, "ci.yml");
const pagesDoc = parseWorkflow(pagesRaw, "pages.yml");

// yq may parse `on` as a key; JSON has "on". Our subset parser keeps "on".
// Some YAML loaders turn `on:` into boolean true key — normalize if needed.
const normalizeOn = (doc) => {
  if (!doc || typeof doc !== "object") return doc;
  if (doc.on !== undefined) return doc;
  if (doc.true !== undefined) {
    return { ...doc, on: doc.true };
  }
  return doc;
};

checkReleaseWorkflow(normalizeOn(releaseDoc));
checkCiWorkflow(normalizeOn(ciDoc));
checkPagesWorkflow(normalizeOn(pagesDoc), pagesRaw);

if (errors.length > 0) {
  for (const error of errors) {
    console.error(`error: ${error}`);
  }
  console.error(`check-release-workflows: ${errors.length} error(s)`);
  process.exit(1);
}

console.log("check-release-workflows: ok");

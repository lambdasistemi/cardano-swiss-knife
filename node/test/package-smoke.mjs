import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const packageName = "@lambdasistemi/cardano-swiss-knife";
const tarball = process.env.CSK_PACKAGE_TARBALL;
const vectors = JSON.parse(await readFile(new URL("../../test-vectors/vectors.json", import.meta.url), "utf8"));
const mnemonic = vectors.derivationVectors[0].mnemonic.join(" ");
const signing = vectors.signingVectors[0];
const npmExecPath = process.env.npm_execpath;

const run = (command, args, options = {}) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { ...options, stdio: ["pipe", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.on("error", reject);
  child.on("close", (code) => resolve({ code, stdout, stderr }));
  child.stdin.end(options.input || "");
});

const filesBelow = async (root) => {
  const paths = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) paths.push(...await filesBelow(path));
    else paths.push(path);
  }
  return paths;
};

test("installs a prepacked artifact outside the checkout without network, native hooks, or secret leakage", async () => {
  assert.ok(tarball, "CSK_PACKAGE_TARBALL must name the prebuilt npm pack artifact");
  assert.ok(npmExecPath, "npm_execpath must name npm's JavaScript entrypoint; run this smoke through npm run");
  const foreignProject = await mkdtemp(join(tmpdir(), "csk-package-smoke-"));
  try {
    await writeFile(join(foreignProject, "package.json"), '{"private":true,"type":"module"}\n');
    const installed = await run(process.execPath, [npmExecPath, "install", "--ignore-scripts", "--no-audit", "--no-fund", "--offline", tarball], {
      cwd: foreignProject,
      env: { ...process.env, HOME: foreignProject, npm_config_cache: join(foreignProject, ".npm-cache") },
    });
    assert.equal(installed.code, 0, installed.stderr);

    const packageRoot = join(foreignProject, "node_modules", "@lambdasistemi", "cardano-swiss-knife");
    const packageJson = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
    assert.deepEqual(packageJson.dependencies || {}, {}, "packed artifact must bundle all runtime JavaScript");
    assert.deepEqual(packageJson.optionalDependencies || {}, {}, "packed artifact must have no platform-specific optional dependencies");
    for (const hook of ["preinstall", "install", "postinstall", "prepare", "prepublish", "prepublishOnly"]) {
      assert.equal(packageJson.scripts?.[hook], undefined, `packed package declares ${hook}`);
    }
    for (const path of await filesBelow(join(foreignProject, "node_modules"))) {
      assert.equal(path.endsWith(".node"), false, `native addon packaged: ${path}`);
      const contents = await readFile(path);
      assert.equal(contents.includes("node-gyp"), false, `native build reference packaged: ${path}`);
      assert.equal(contents.includes(mnemonic), false, `mnemonic leaked into package: ${path}`);
      assert.equal(contents.includes(signing.signingKeyBech32), false, `private key leaked into package: ${path}`);
    }

    const networkGuard = join(foreignProject, "network-denied.mjs");
    await writeFile(networkGuard, `
      import net from "node:net";
      import http from "node:http";
      import https from "node:https";
      import tls from "node:tls";
      import dgram from "node:dgram";
      import dns from "node:dns";
      import { syncBuiltinESMExports } from "node:module";
      const denied = (name) => () => { throw new Error("outbound network attempted via " + name); };
      net.connect = denied("net.connect"); net.createConnection = denied("net.createConnection");
      http.request = denied("http.request"); http.get = denied("http.get");
      https.request = denied("https.request"); https.get = denied("https.get");
      tls.connect = denied("tls.connect"); dgram.createSocket = denied("dgram.createSocket");
      dns.lookup = denied("dns.lookup"); dns.resolve = denied("dns.resolve");
      globalThis.fetch = denied("fetch"); syncBuiltinESMExports();
    `);
    const program = join(foreignProject, "foreign-program.mjs");
    await writeFile(program, `
      const secrets = ${JSON.stringify([mnemonic, signing.signingKeyBech32])};
      if (secrets.some((secret) => process.argv.includes(secret) || Object.values(process.env).includes(secret))) throw new Error("secret leaked through argv or environment");
      const api = await import(${JSON.stringify(packageName)});
      const vectors = ${JSON.stringify({ inspection: vectors.inspectionVectors[0], derivation: vectors.derivationVectors[0], signing })};
      const inspection = await api.inspectAddress(vectors.inspection.address);
      const derivation = await api.deriveKeys({ mnemonic: vectors.derivation.mnemonic, accountIndex: vectors.derivation.accountIndex, role: vectors.derivation.role, addressIndex: vectors.derivation.addressIndex });
      const signed = await api.signPayload({ payloadMode: vectors.signing.payloadMode, payloadInput: vectors.signing.payloadInput, signingKeyBech32: vectors.signing.signingKeyBech32 });
      const verified = await api.verifySignature({ payloadMode: vectors.signing.payloadMode, payloadInput: vectors.signing.payloadInput, verificationKeyBech32: vectors.signing.verificationKeyBech32, signatureHex: signed.value.signatureHex });
      console.log(JSON.stringify({ inspection, derivation, signed: signed.ok, verified }));
    `);
    const api = await run(process.execPath, ["--import", networkGuard, program], { cwd: foreignProject });
    assert.equal(api.code, 0, api.stderr);
    const result = JSON.parse(api.stdout);
    assert.equal(result.inspection.ok, true);
    assert.equal(result.derivation.ok, true);
    assert.equal(result.signed, true);
    assert.deepEqual(result.verified, { ok: true, value: true });

    const cli = join(packageRoot, "node", "dist", "csk.mjs");
    const command = await run(process.execPath, ["--import", networkGuard, cli, "payload", "sign", "--secret-stdin", "--payload-mode", signing.payloadMode, "--payload-input", signing.payloadInput, "--output", "json"], {
      cwd: foreignProject,
      input: `${signing.signingKeyBech32}\n`,
    });
    assert.equal(command.code, 0, command.stderr);
    assert.equal(JSON.parse(command.stdout).ok, true);
    assert.equal(`${command.stdout}${command.stderr}`.includes(mnemonic), false);
    assert.equal(`${command.stdout}${command.stderr}`.includes(signing.signingKeyBech32), false);
  } finally {
    await rm(foreignProject, { recursive: true, force: true });
  }
});

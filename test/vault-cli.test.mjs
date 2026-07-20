import assert from "node:assert/strict";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";
import { Encrypter } from "age-encryption";
import { decryptVault, encryptVault } from "../lib/src/Cardano/Vault.js";

const root = new URL("..", import.meta.url);
const cli = new URL("../cli/csk.mjs", import.meta.url);
const passphrase = "cli fixture passphrase";
const secret = "cli fixture secret that must never be displayed";
const execFileAsync = promisify(execFile);

const run = (args, input = "", extraFd) => new Promise((resolve) => {
  const child = spawn(process.execPath, [cli.pathname, ...args], { cwd: root, stdio: extraFd === undefined ? ["pipe", "pipe", "pipe"] : ["ignore", "pipe", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.on("close", (code) => resolve({ code, stdout, stderr }));
  if (extraFd === undefined) child.stdin.end(input);
  else { child.stdio[3].on("error", () => {}); child.stdio[3].end(extraFd); }
});

const withVault = async (fn) => fn(await mkdtemp(join(tmpdir(), "csk-vault-cli-")));
const fdArgs = (fd) => ["--passphrase-fd", String(fd)];
const redacted = (result, value = secret) => {
  assert.doesNotMatch(`${result.stdout}${result.stderr}`, new RegExp(value));
};
const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
const ptyCreate = async (out, mismatch = false) => {
  const before = `${out}.before`;
  const after = `${out}.after`;
  const script = [
    "log_user 0",
    "set timeout 15",
    `spawn sh -c {stty -g > ${quote(before)}; node ${quote(cli.pathname)} vault create --out ${quote(out)} --force; status=$?; stty -g > ${quote(after)}; exit $status}`,
    'expect "Vault passphrase:"', `send -- "${passphrase}\\r"`,
    'expect "Confirm vault passphrase:"', `send -- "${mismatch ? "different confirmation" : passphrase}\\r"`,
    "expect eof", "puts -nonewline $expect_out(buffer)",
  ].join("\n");
  let result;
  try { result = { ...(await execFileAsync("expect", ["-c", script])), code: 0 }; }
  catch (error) { result = { stdout: error.stdout ?? "", stderr: error.stderr ?? "", code: error.code ?? 1 }; }
  return { ...result, before: await readFile(before, "utf8"), after: await readFile(after, "utf8") };
};
const ptySignal = async (out) => {
  const before = `${out}.before`; const after = `${out}.after`;
  const script = ["log_user 0", "set timeout 15", `spawn sh -c {stty -g > ${quote(before)}; node ${quote(cli.pathname)} vault create --out ${quote(out)}; status=$?; stty -g > ${quote(after)}; exit $status}`, 'expect "Vault passphrase:"', "send \\003", "expect eof", "puts -nonewline $expect_out(buffer)"].join("\n");
  let result; try { result = { ...(await execFileAsync("expect", ["-c", script])), code: 0 }; } catch (error) { result = { stdout: error.stdout ?? "", stderr: error.stderr ?? "", code: error.code ?? 1 }; }
  return { ...result, before: await readFile(before, "utf8"), after: await readFile(after, "utf8") };
};
const encryptedWrapper = async (fixture) => {
  const encrypter = new Encrypter();
  encrypter.setPassphrase(passphrase);
  return encrypter.encrypt(await readFile(new URL(`./fixtures/vault/${fixture}`, import.meta.url), "utf8"));
};
const encryptRaw = async (payload) => {
  const encrypter = new Encrypter(); encrypter.setPassphrase(passphrase);
  return encrypter.encrypt(JSON.stringify(payload));
};

test("csk exposes only vault lifecycle help and rejects secret-bearing flags and environment-style assignments", async () => {
  const help = await run(["--help"]);
  assert.equal(help.code, 0);
  assert.match(help.stdout, /vault create/);
  for (const args of [["vault", "create", "--passphrase", passphrase], ["vault", "list", "--vault-passphrase", passphrase], ["vault", "create", "PASSPHRASE=bad"]]) {
    const result = await run(args);
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /Vault arguments are invalid\./);
    redacted(result, passphrase);
  }
});

test("create confirms inherited FD passphrases after stripping one CRLF and writes an exclusive 0600 age vault", async () => withVault(async (dir) => {
  const out = join(dir, "created.age");
  const result = await run(["vault", "create", "--out", out, ...fdArgs(0)], `${passphrase}\r\n${passphrase}\r\n`);
  assert.equal(result.code, 0, result.stderr);
  assert.match(await readFile(out, "utf8"), /^age-encryption\.org\/v1/);
  assert.equal((await stat(out)).mode & 0o777, 0o600);
  redacted(result, passphrase);
}));

test("create accepts a non-stdio inherited descriptor for automation", async () => withVault(async (dir) => {
  const out = join(dir, "fd3.age");
  const result = await run(["vault", "create", "--out", out, "--passphrase-fd", "3"], "", `${passphrase}\n${passphrase}\n`);
  assert.equal(result.code, 0, result.stderr);
  assert.match(await readFile(out, "utf8"), /^age-encryption\.org\/v1/);
  redacted(result, passphrase);
}));

test("list renders only the non-secret projection in human and JSON modes", async () => withVault(async (dir) => {
  const input = join(dir, "tx-sign.age");
  const out = join(dir, "listed.age");
  await writeFile(input, await encryptedWrapper("tx-sign-v1.json"));
  assert.equal((await run(["vault", "migrate", "--input", input, "--out", out, "--input-passphrase-fd", "0", "--passphrase-fd", "0"], `${passphrase}\n${passphrase}\n`)).code, 0);
  const human = await run(["vault", "list", "--vault", out, ...fdArgs(0)], `${passphrase}\n`);
  const json = await run(["vault", "list", "--vault", out, "--json", ...fdArgs(0)], `${passphrase}\n`);
  assert.equal(human.code, 0, human.stderr);
  assert.equal(json.code, 0, json.stderr);
  assert.deepEqual(JSON.parse(json.stdout).map(({ id, kind, label }) => ({ id, kind, label })), [{ id: "migrated:cardanoTxSignVault:deadbeef", kind: "cardano-cli-skey", label: "Payment signing key" }]);
  redacted(human, "5820deadbeef"); redacted(json, "5820deadbeef");
}));

test("create and migrate fail closed for overwrite, malformed/version/wrong-pass inputs and leave no partial target", async () => withVault(async (dir) => {
  const out = join(dir, "target.age");
  await writeFile(out, "original");
  const original = await readFile(out, "utf8");
  for (const args of [
    ["vault", "create", "--out", out, ...fdArgs(0)],
    ["vault", "migrate", "--input", join(dir, "missing"), "--out", join(dir, "missing.age"), "--input-passphrase-fd", "0", "--passphrase-fd", "0"],
  ]) {
    const result = await run(args, `${passphrase}\n${passphrase}\n`);
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /^Vault (output exists|input is invalid)\./m);
    redacted(result);
  }
  assert.equal(await readFile(out, "utf8"), original);
}));

test("list rejects malformed canonical, unsupported version, duplicate identity, and wrong passphrase with fixed redacted diagnostics", async () => withVault(async (dir) => {
  const canonical = (entries, version = 1) => ({ cardanoSwissKnifeVault: { version, entries } });
  const entry = (id) => ({ id, kind: "mnemonic", label: "fixture", value: secret, createdAt: "2026-07-20T00:00:00.000Z" });
  const cases = [
    ["malformed", new TextEncoder().encode("not a vault"), passphrase, /Vault unlock failed\./],
    ["version", await encryptRaw(canonical([], 2)), passphrase, /Vault version is unsupported\./],
    ["duplicate", await encryptRaw(canonical([entry("same"), entry("same")])), passphrase, /Vault identity is ambiguous\./],
    ["wrong-passphrase", await encryptVault(passphrase, canonical([entry("one")])), "wrong passphrase", /Vault unlock failed\./],
  ];
  for (const [name, bytes, phrase, expected] of cases) {
    const path = join(dir, `${name}.age`);
    await writeFile(path, bytes);
    const result = await run(["vault", "list", "--vault", path, ...fdArgs(0)], `${phrase}\n`);
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, expected);
    assert.equal((await readFile(path)).length, bytes.length);
    redacted(result, secret); redacted(result, passphrase);
  }
}));

test("migrate leaves an existing target and no adjacent temporary artifact for malformed legacy input", async () => withVault(async (dir) => {
  const input = join(dir, "malformed.json"); const out = join(dir, "existing.age");
  await writeFile(input, "{ malformed"); await writeFile(out, "preserved target");
  const result = await run(["vault", "migrate", "--input", input, "--out", out, "--input-passphrase-fd", "0", "--passphrase-fd", "0"], `${passphrase}\n${passphrase}\n`);
  assert.notEqual(result.code, 0); assert.match(result.stderr, /Vault (format|input) is invalid\./);
  assert.equal(await readFile(out, "utf8"), "preserved target");
  assert.deepEqual((await (await import("node:fs/promises")).readdir(dir)).filter((name) => name.includes(".tmp")), []);
  redacted(result, passphrase);
}));

test("migrates each recognized legacy family to a canonical age vault without changing the input", async () => withVault(async (dir) => {
  for (const fixture of ["legacy-csk-v1.json", "tx-sign-v1.json", "amaru-v1.json"]) {
    const input = join(dir, `${fixture}.input`);
    const out = join(dir, `${fixture}.age`);
    const bytes = fixture === "legacy-csk-v1.json" ? await readFile(new URL(`./fixtures/vault/${fixture}`, import.meta.url)) : await encryptedWrapper(fixture);
    await writeFile(input, bytes);
    const original = await readFile(input);
    const inputPassphrase = fixture === "legacy-csk-v1.json" ? "test vault passphrase" : passphrase;
    const result = await run(["vault", "migrate", "--input", input, "--out", out, "--input-passphrase-fd", "0", "--passphrase-fd", "0"], `${inputPassphrase}\n${passphrase}\n`);
    assert.equal(result.code, 0, result.stderr);
    assert.match(await readFile(out, "utf8"), /^age-encryption\.org\/v1/);
    assert.deepEqual(await readFile(input), original);
    const listed = await run(["vault", "list", "--vault", out, "--json", ...fdArgs(0)], `${passphrase}\n`);
    assert.equal(listed.code, 0, listed.stderr);
    const entries = JSON.parse(listed.stdout);
    if (fixture === "legacy-csk-v1.json") {
      assert.deepEqual(entries.map(({ id, kind, label }) => ({ id, kind, label })), [{ id: "legacy-mnemonic", kind: "mnemonic", label: "Legacy seed" }, { id: "legacy-key", kind: "signing-key", label: "Legacy signing key" }]);
      assert.ok((await decryptVault(passphrase, new Uint8Array(await readFile(out)))).cardanoSwissKnifeVault.entries.every(({ value }) => typeof value === "string" && value.length > 0));
    }
    if (fixture === "tx-sign-v1.json") assert.deepEqual(entries, [{ id: "migrated:cardanoTxSignVault:deadbeef", kind: "cardano-cli-skey", label: "Payment signing key", createdAt: entries[0].createdAt, network: "preprod", keyHash: "deadbeef", description: "Synthetic payment key" }]);
    if (fixture === "amaru-v1.json") assert.deepEqual(entries, [{ id: "migrated:amaruTreasuryWitnessVault:c0ffee", kind: "cardano-addresses-addr-xsk", label: "Treasury root", createdAt: entries[0].createdAt, network: "mainnet", keyHash: "c0ffee", description: "Synthetic treasury root" }]);
    const decrypted = (await decryptVault(passphrase, new Uint8Array(await readFile(out)))).cardanoSwissKnifeVault.entries;
    if (fixture === "tx-sign-v1.json") assert.equal(decrypted[0].value, JSON.stringify({ type: "PaymentSigningKeyShelley_ed25519", description: "Synthetic payment key", cborHex: "5820deadbeef" }));
    if (fixture === "amaru-v1.json") assert.equal(decrypted[0].value, "root_xsk1syntheticamarutreasuryroot");
    assert.doesNotMatch(listed.stdout, /5820deadbeef|root_xsk1syntheticamarutreasuryroot/);
    redacted(result, passphrase);
  }
}));

test("force atomically replaces an existing target and pseudo-TTY input is no-echo with restored terminal state", async () => withVault(async (dir) => {
  const out = join(dir, "tty.age");
  await writeFile(out, "old target");
  const oldInode = (await stat(out)).ino;
  const pty = await ptyCreate(out);
  assert.notEqual((await stat(out)).ino, oldInode);
  assert.equal((await stat(out)).mode & 0o777, 0o600);
  assert.equal(pty.before, pty.after);
  assert.doesNotMatch(`${pty.stdout}${pty.stderr}`, new RegExp(passphrase));
  const forced = await run(["vault", "create", "--out", out, "--force", ...fdArgs(0)], `${passphrase}\n${passphrase}\n`);
  assert.equal(forced.code, 0, forced.stderr);
  assert.match(await readFile(out, "utf8"), /^age-encryption\.org\/v1/);
  const mismatchTarget = join(dir, "mismatch.age");
  const failed = await ptyCreate(mismatchTarget, true);
  assert.notEqual(failed.code, 0);
  assert.notEqual(failed.before, ""); assert.notEqual(failed.after, "");
  assert.equal(failed.before, failed.after);
  await assert.rejects(readFile(mismatchTarget));
  assert.doesNotMatch(`${failed.stdout}${failed.stderr}`, new RegExp(`${passphrase}|different confirmation`));
}));

test("SIGINT during a no-echo TTY prompt restores terminal state without creating a vault or leaking a passphrase", async () => withVault(async (dir) => {
  const out = join(dir, "signal.age"); const result = await ptySignal(out);
  assert.notEqual(result.code, 0); assert.notEqual(result.before, ""); assert.equal(result.before, result.after);
  await assert.rejects(readFile(out)); assert.doesNotMatch(`${result.stdout}${result.stderr}`, new RegExp(passphrase));
}));

test("migrate rejects a real encrypted wrapper with a wrong passphrase without changing input, target, or temp state", async () => withVault(async (dir) => {
  const input = join(dir, "wrong-pass.age"); const out = join(dir, "wrong-pass-output.age");
  await writeFile(input, await encryptedWrapper("tx-sign-v1.json")); const original = await readFile(input);
  const result = await run(["vault", "migrate", "--input", input, "--out", out, "--input-passphrase-fd", "0", "--passphrase-fd", "0"], `wrong passphrase\n${passphrase}\n`);
  assert.notEqual(result.code, 0); assert.match(result.stderr, /Vault unlock failed\./);
  await assert.rejects(readFile(out)); assert.deepEqual(await readFile(input), original);
  assert.deepEqual((await (await import("node:fs/promises")).readdir(dir)).filter((name) => name.includes(".tmp")), []);
  redacted(result, "wrong passphrase"); redacted(result, passphrase);
}));

import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, stat, writeFile } from "node:fs/promises";
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
const runWithFd3 = (args, fd3Input, env = {}) => new Promise((resolve) => {
  const child = spawn(process.execPath, [cli.pathname, ...args], { cwd: root, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.on("close", (code) => resolve({ code, stdout, stderr }));
  child.stdio[3].on("error", () => {});
  child.stdio[3].end(fd3Input);
});
const fdArgs = (fd) => ["--passphrase-fd", String(fd)];
const redacted = (result, value = secret) => {
  assert.doesNotMatch(`${result.stdout}${result.stderr}`, new RegExp(value));
};
const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
const tclString = (value) => `"${value.replace(/[\\$[\]"]/g, (ch) => `\\${ch}`)}"`;
const typeSlowProc = "proc type_slow {value} {\n  foreach ch [split $value {}] {\n    send -- $ch\n    after 20\n  }\n  send -- \"\\r\"\n}";
const typeSlow = (value) => `type_slow ${tclString(value)}`;
const ptyCreate = async (out, mismatch = false) => {
  const before = `${out}.before`;
  const after = `${out}.after`;
  const script = [
    "log_user 0",
    "set timeout 15",
    typeSlowProc,
    `spawn sh -c {stty -g > ${quote(before)}; node ${quote(cli.pathname)} vault create --out ${quote(out)} --force; status=$?; stty -g > ${quote(after)}; exit $status}`,
    'expect "Vault passphrase:"', typeSlow(passphrase),
    'expect "Confirm vault passphrase:"', typeSlow(mismatch ? "different confirmation" : passphrase),
    "expect eof", "puts -nonewline $expect_out(buffer)", "exit [lindex [wait] 3]",
  ].join("\n");
  let result;
  try { result = { ...(await execFileAsync("expect", ["-c", script])), code: 0 }; }
  catch (error) { result = { stdout: error.stdout ?? "", stderr: error.stderr ?? "", code: error.code ?? 1 }; }
  return { ...result, before: await readFile(before, "utf8"), after: await readFile(after, "utf8") };
};
const ptySignal = async (out) => {
  const before = `${out}.before`; const after = `${out}.after`;
  const script = ["log_user 0", "set timeout 15", `spawn sh -c {stty -g > ${quote(before)}; node ${quote(cli.pathname)} vault create --out ${quote(out)}; status=$?; stty -g > ${quote(after)}; exit $status}`, 'expect "Vault passphrase:"', "send \\003", "expect eof", "puts -nonewline $expect_out(buffer)", "exit [lindex [wait] 3]"].join("\n");
  let result; try { result = { ...(await execFileAsync("expect", ["-c", script])), code: 0 }; } catch (error) { result = { stdout: error.stdout ?? "", stderr: error.stderr ?? "", code: error.code ?? 1 }; }
  return { ...result, before: await readFile(before, "utf8"), after: await readFile(after, "utf8") };
};
const noncanonicalPreamble = "stty -icanon -echo min 1 time 0";
const ptyCreateNoncanonical = async (out) => {
  const before = `${out}.before`;
  const after = `${out}.after`;
  const script = [
    "log_user 0",
    "set timeout 15",
    typeSlowProc,
    `spawn sh -c {${noncanonicalPreamble}; stty -g > ${quote(before)}; node ${quote(cli.pathname)} vault create --out ${quote(out)} --force; status=$?; stty -g > ${quote(after)}; exit $status}`,
    'expect "Vault passphrase:"', typeSlow(passphrase),
    'expect "Confirm vault passphrase:"', typeSlow(passphrase),
    "expect eof", "puts -nonewline $expect_out(buffer)", "exit [lindex [wait] 3]",
  ].join("\n");
  let result;
  try { result = { ...(await execFileAsync("expect", ["-c", script])), code: 0 }; }
  catch (error) { result = { stdout: error.stdout ?? "", stderr: error.stderr ?? "", code: error.code ?? 1 }; }
  return { ...result, before: await readFile(before, "utf8"), after: await readFile(after, "utf8") };
};
const ptyCredentialAddNoncanonical = async (vault, { provider, id, label, credential }) => {
  const before = `${vault}.${id}.before`;
  const after = `${vault}.${id}.after`;
  const script = [
    "log_user 0",
    "set timeout 15",
    typeSlowProc,
    `spawn sh -c {${noncanonicalPreamble}; stty -g > ${quote(before)}; node ${quote(cli.pathname)} vault credential add --vault ${quote(vault)} --provider ${provider} --id ${quote(id)} --label ${quote(label)}; status=$?; stty -g > ${quote(after)}; exit $status}`,
    'expect "Vault passphrase:"', typeSlow(passphrase),
    `expect "${providerPrompt[provider]}:"`, typeSlow(credential),
    "expect eof", "puts -nonewline $expect_out(buffer)", "exit [lindex [wait] 3]",
  ].join("\n");
  let result;
  try { result = { ...(await execFileAsync("expect", ["-c", script])), code: 0 }; }
  catch (error) { result = { stdout: error.stdout ?? "", stderr: error.stderr ?? "", code: error.code ?? 1 }; }
  return { ...result, before: await readFile(before, "utf8"), after: await readFile(after, "utf8") };
};
const ptyEmptyPassphrase = async (out) => {
  const before = `${out}.before`; const after = `${out}.after`;
  const script = ["log_user 0", "set timeout 15", `spawn sh -c {stty -g > ${quote(before)}; node ${quote(cli.pathname)} vault create --out ${quote(out)}; status=$?; stty -g > ${quote(after)}; exit $status}`, 'expect "Vault passphrase:"', "send -- \"\\r\"", "expect eof", "puts -nonewline $expect_out(buffer)", "exit [lindex [wait] 3]"].join("\n");
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
const controlChar = String.fromCharCode(7);
const providerPrompt = { blockfrost: "Blockfrost project ID", koios: "Koios bearer token" };
const ptyCredentialAdd = async (vault, { provider, id, label, credential }) => {
  const before = `${vault}.${id}.before`;
  const after = `${vault}.${id}.after`;
  const script = [
    "log_user 0",
    "set timeout 15",
    typeSlowProc,
    `spawn sh -c {stty -g > ${quote(before)}; node ${quote(cli.pathname)} vault credential add --vault ${quote(vault)} --provider ${provider} --id ${quote(id)} --label ${quote(label)}; status=$?; stty -g > ${quote(after)}; exit $status}`,
    'expect "Vault passphrase:"', typeSlow(passphrase),
    `expect "${providerPrompt[provider]}:"`, typeSlow(credential),
    "expect eof", "puts -nonewline $expect_out(buffer)", "exit [lindex [wait] 3]",
  ].join("\n");
  let result;
  try { result = { ...(await execFileAsync("expect", ["-c", script])), code: 0 }; }
  catch (error) { result = { stdout: error.stdout ?? "", stderr: error.stderr ?? "", code: error.code ?? 1 }; }
  return { ...result, before: await readFile(before, "utf8"), after: await readFile(after, "utf8") };
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

test("a deliberately noncanonical controlling terminal must not truncate the vault create passphrase lines, and must restore that exact noncanonical state", async () => withVault(async (dir) => {
  const out = join(dir, "noncanonical-create.age");
  const result = await ptyCreateNoncanonical(out);
  const vaultUsableWithFullPassphrase = await readFile(out)
    .then(async (bytes) => { try { await decryptVault(passphrase, new Uint8Array(bytes)); return true; } catch { return false; } })
    .catch(() => false);
  assert.equal(vaultUsableWithFullPassphrase, true, "a line-aware reader must establish canonical input and consume the complete passphrase and confirmation lines even when the terminal starts noncanonical");
  assert.notEqual(result.before, "");
  assert.notEqual(result.after, "");
  assert.equal(result.before, result.after, "the deliberately noncanonical pre-prompt state must be restored exactly, not replaced with a generic canonical state");
  assert.doesNotMatch(`${result.stdout}${result.stderr}`, new RegExp(passphrase));
}));

test("SIGINT during a no-echo TTY prompt restores terminal state without creating a vault or leaking a passphrase", async () => withVault(async (dir) => {
  const out = join(dir, "signal.age"); const result = await ptySignal(out);
  assert.notEqual(result.code, 0); assert.notEqual(result.before, ""); assert.equal(result.before, result.after);
  await assert.rejects(readFile(out)); assert.doesNotMatch(`${result.stdout}${result.stderr}`, new RegExp(passphrase));
}));

test("TTY create works with stdin redirected to null and never echoes its passphrase", async () => withVault(async (dir) => {
  const out = join(dir, "redirected.age");
  const before = `${out}.before`; const after = `${out}.after`;
  const script = ["log_user 1", `log_file {${out}.transcript}`, "set timeout 15", typeSlowProc, `spawn sh -c {stty -g > ${quote(before)}; node ${quote(cli.pathname)} vault create --out ${quote(out)} </dev/null; status=$?; stty -g > ${quote(after)}; exit $status}`, 'expect "Vault passphrase:"', typeSlow(passphrase), 'expect "Confirm vault passphrase:"', typeSlow(passphrase), "expect eof", "exit [lindex [wait] 3]"].join("\n");
  const result = await execFileAsync("expect", ["-c", script]); assert.match(await readFile(out, "utf8"), /^age-encryption\.org\/v1/); const beforeState = await readFile(before, "utf8"); const afterState = await readFile(after, "utf8"); assert.notEqual(beforeState, ""); assert.notEqual(afterState, ""); assert.equal(beforeState, afterState); assert.doesNotMatch(`${result.stdout}${result.stderr}${await readFile(`${out}.transcript`, "utf8")}`, new RegExp(passphrase));
}));

test("migrate supports one inherited passphrase FD and one shared controlling-terminal prompt", async () => withVault(async (dir) => {
  const input = join(dir, "mixed.input"); const out = join(dir, "mixed.age"); const fifo = join(dir, "mixed.fd"); const before = `${out}.before`; const after = `${out}.after`;
  await writeFile(input, await encryptedWrapper("tx-sign-v1.json"));
  await execFileAsync("mkfifo", [fifo]); const writer = writeFile(fifo, passphrase);
  const script = ["log_user 1", `log_file {${out}.transcript}`, "set timeout 15", typeSlowProc, `spawn sh -c {stty -g > ${quote(before)}; exec 3<${quote(fifo)}; node ${quote(cli.pathname)} vault migrate --input ${quote(input)} --out ${quote(out)} --input-passphrase-fd 3; status=$?; stty -g > ${quote(after)}; exit $status}`, 'expect "Vault passphrase:"', typeSlow(passphrase), "expect eof", "exit [lindex [wait] 3]"].join("\n");
  const result = await execFileAsync("expect", ["-c", script]); await writer; assert.match(await readFile(out, "utf8"), /^age-encryption\.org\/v1/); const beforeState = await readFile(before, "utf8"); const afterState = await readFile(after, "utf8"); assert.notEqual(beforeState, ""); assert.notEqual(afterState, ""); assert.equal(beforeState, afterState); assert.doesNotMatch(`${result.stdout}${result.stderr}${await readFile(`${out}.transcript`, "utf8")}`, new RegExp(passphrase)); assert.equal((await run(["vault", "list", "--vault", out, ...fdArgs(0)], `${passphrase}\n`)).code, 0);
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

test("vault credential add reads the Blockfrost or Koios credential from a no-echo controlling terminal, restores terminal state, and lists redacted metadata", async () => withVault(async (dir) => {
  const out = join(dir, "credentials.age");
  assert.equal((await run(["vault", "create", "--out", out, ...fdArgs(0)], `${passphrase}\n${passphrase}\n`)).code, 0);
  for (const [provider, kind, id, credentialValue] of [
    ["blockfrost", "blockfrost-project-id", "bf-entry", "blockfrost-secret-value"],
    ["koios", "koios-bearer-token", "koios-entry", "koios-secret-value"],
  ]) {
    const beforeInode = (await stat(out)).ino;
    const pty = await ptyCredentialAdd(out, { provider, id, label: `${provider} label`, credential: credentialValue });
    assert.equal(pty.code, 0, `${pty.stdout}${pty.stderr}`);
    assert.notEqual((await stat(out)).ino, beforeInode);
    assert.equal((await stat(out)).mode & 0o777, 0o600);
    assert.equal(pty.before, pty.after);
    assert.doesNotMatch(`${pty.stdout}${pty.stderr}`, new RegExp(`${passphrase}|${credentialValue}`));
    const human = await run(["vault", "list", "--vault", out, ...fdArgs(0)], `${passphrase}\n`);
    const listed = await run(["vault", "list", "--vault", out, "--json", ...fdArgs(0)], `${passphrase}\n`);
    assert.equal(listed.code, 0, listed.stderr);
    const entries = JSON.parse(listed.stdout);
    const entry = entries.find((item) => item.id === id);
    assert.ok(entry, `${id} must be listed`);
    assert.equal(entry.kind, kind);
    assert.equal(entry.label, `${provider} label`);
    assert.match(entry.createdAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/);
    assert.equal(Object.hasOwn(entry, "value"), false);
    assert.match(human.stdout, new RegExp(id));
    for (const result of [human, listed]) redacted(result, credentialValue);
  }
}));

test("a deliberately noncanonical controlling terminal must not truncate the vault credential add passphrase or credential lines, and must restore that exact noncanonical state", async () => withVault(async (dir) => {
  const out = join(dir, "noncanonical-credential.age");
  assert.equal((await run(["vault", "create", "--out", out, ...fdArgs(0)], `${passphrase}\n${passphrase}\n`)).code, 0);
  const credentialValue = "noncanonical-secret-value";
  const result = await ptyCredentialAddNoncanonical(out, { provider: "blockfrost", id: "noncanonical-entry", label: "Noncanonical", credential: credentialValue });
  assert.equal(result.code, 0, `${result.stdout}${result.stderr}`);
  const decrypted = await decryptVault(passphrase, new Uint8Array(await readFile(out)));
  const entry = decrypted.cardanoSwissKnifeVault.entries.find((item) => item.id === "noncanonical-entry");
  assert.equal(entry?.value, credentialValue, "a line-aware reader must establish canonical input and consume the complete passphrase and credential lines even when the terminal starts noncanonical");
  assert.notEqual(result.before, "");
  assert.notEqual(result.after, "");
  assert.equal(result.before, result.after, "the deliberately noncanonical pre-prompt state must be restored exactly, not replaced with a generic canonical state");
  assert.doesNotMatch(`${result.stdout}${result.stderr}`, new RegExp(`${passphrase}|${credentialValue}`));
}));

test("vault credential add accepts an inherited passphrase descriptor while still reading the credential from the controlling terminal", async () => withVault(async (dir) => {
  const out = join(dir, "fd-credentials.age");
  assert.equal((await run(["vault", "create", "--out", out, ...fdArgs(0)], `${passphrase}\n${passphrase}\n`)).code, 0);
  const fifo = join(dir, "credential-add.fd");
  const before = `${out}.fd.before`; const after = `${out}.fd.after`;
  await execFileAsync("mkfifo", [fifo]);
  const writer = writeFile(fifo, passphrase);
  const credentialValue = "blockfrost-fd-secret-value";
  const script = [
    "log_user 1", `log_file {${out}.fd.transcript}`, "set timeout 15",
    typeSlowProc,
    `spawn sh -c {stty -g > ${quote(before)}; exec 3<${quote(fifo)}; node ${quote(cli.pathname)} vault credential add --vault ${quote(out)} --provider blockfrost --id fd-entry --label "FD entry" --passphrase-fd 3; status=$?; stty -g > ${quote(after)}; exit $status}`,
    'expect "Blockfrost project ID:"', typeSlow(credentialValue),
    "expect eof", "exit [lindex [wait] 3]",
  ].join("\n");
  const result = await execFileAsync("expect", ["-c", script]);
  await writer;
  const beforeState = await readFile(before, "utf8"); const afterState = await readFile(after, "utf8");
  assert.notEqual(beforeState, ""); assert.notEqual(afterState, ""); assert.equal(beforeState, afterState);
  const transcript = await readFile(`${out}.fd.transcript`, "utf8");
  assert.doesNotMatch(`${result.stdout}${result.stderr}${transcript}`, new RegExp(`${passphrase}|${credentialValue}`));
  const listed = await run(["vault", "list", "--vault", out, "--json", ...fdArgs(0)], `${passphrase}\n`);
  assert.equal(listed.code, 0, listed.stderr);
  assert.ok(JSON.parse(listed.stdout).some((entry) => entry.id === "fd-entry" && entry.kind === "blockfrost-project-id"));
}));

test("vault credential add rejects a duplicate id and a whitespace-only credential without modifying the vault", async () => withVault(async (dir) => {
  const out = join(dir, "dup.age");
  assert.equal((await run(["vault", "create", "--out", out, ...fdArgs(0)], `${passphrase}\n${passphrase}\n`)).code, 0);
  const first = await ptyCredentialAdd(out, { provider: "blockfrost", id: "dup-entry", label: "First", credential: "first-secret-value" });
  assert.equal(first.code, 0, `${first.stdout}${first.stderr}`);
  assert.equal(first.before, first.after);
  const beforeBytes = await readFile(out);
  const duplicate = await ptyCredentialAdd(out, { provider: "koios", id: "dup-entry", label: "Second", credential: "second-secret-value" });
  assert.notEqual(duplicate.code, 0);
  assert.notEqual(duplicate.before, "");
  assert.equal(duplicate.before, duplicate.after);
  assert.deepEqual(await readFile(out), beforeBytes);
  assert.doesNotMatch(`${duplicate.stdout}${duplicate.stderr}`, /first-secret-value|second-secret-value/);
  const whitespace = await ptyCredentialAdd(out, { provider: "blockfrost", id: "whitespace-entry", label: "Whitespace", credential: "   " });
  assert.notEqual(whitespace.code, 0);
  assert.notEqual(whitespace.before, "");
  assert.equal(whitespace.before, whitespace.after);
  assert.deepEqual(await readFile(out), beforeBytes);
}));

test("empty passphrase input at the controlling terminal fails closed and restores exact terminal state", async () => withVault(async (dir) => {
  const out = join(dir, "empty-passphrase.age");
  const result = await ptyEmptyPassphrase(out);
  assert.notEqual(result.code, 0);
  assert.notEqual(result.before, "");
  assert.notEqual(result.after, "");
  assert.equal(result.before, result.after);
  await assert.rejects(readFile(out));
  assert.match(`${result.stdout}${result.stderr}`, /Vault passphrase input is invalid\./);
}));

test("vault credential add never exposes the credential or passphrase through process capture or cleartext temporary artifacts", async () => withVault(async (dir) => {
  const out = join(dir, "capture.age");
  assert.equal((await run(["vault", "create", "--out", out, ...fdArgs(0)], `${passphrase}\n${passphrase}\n`)).code, 0);
  const capture = join(dir, "credential-add-capture.json");
  const guard = join(dir, "credential-add-guard.mjs");
  await writeFile(guard, `import { writeFile } from "node:fs/promises"; await writeFile(process.env.CSK_TEST_CAPTURE, JSON.stringify({ argv: process.argv, env: process.env }));`);
  const credentialValue = "capture-proof-secret-value";
  const before = `${out}.capture.before`;
  const after = `${out}.capture.after`;
  const script = [
    "log_user 0",
    "set timeout 15",
    typeSlowProc,
    `spawn sh -c {stty -g > ${quote(before)}; NODE_OPTIONS=${quote(`--import ${new URL(`file://${guard}`).href}`)} CSK_TEST_CAPTURE=${quote(capture)} node ${quote(cli.pathname)} vault credential add --vault ${quote(out)} --provider blockfrost --id capture-entry --label "Capture entry"; status=$?; stty -g > ${quote(after)}; exit $status}`,
    'expect "Vault passphrase:"', typeSlow(passphrase),
    'expect "Blockfrost project ID:"', typeSlow(credentialValue),
    "expect eof", "puts -nonewline $expect_out(buffer)", "exit [lindex [wait] 3]",
  ].join("\n");
  let result;
  try { result = { ...(await execFileAsync("expect", ["-c", script])), code: 0 }; }
  catch (error) { result = { stdout: error.stdout ?? "", stderr: error.stderr ?? "", code: error.code ?? 1 }; }
  assert.equal(result.code, 0, `${result.stdout}${result.stderr}`);
  redacted(result, credentialValue); redacted(result, passphrase);
  const captured = JSON.parse(await readFile(capture, "utf8"));
  assert.doesNotMatch(JSON.stringify(captured), new RegExp(`${credentialValue}|${passphrase}`));
  const duplicate = await ptyCredentialAdd(out, { provider: "koios", id: "capture-entry", label: "Duplicate", credential: "duplicate-attempt-secret" });
  assert.notEqual(duplicate.code, 0);
  const artifacts = await readdir(dir);
  const contents = (await Promise.all(artifacts.map((name) => readFile(join(dir, name), "utf8").catch(() => "")))).join("");
  for (const value of [credentialValue, passphrase, "duplicate-attempt-secret"]) assert.doesNotMatch(contents, new RegExp(value));
  assert.deepEqual(artifacts.filter((name) => name.includes(".tmp")), []);
}));

test("the credential added via vault credential add is selected by tx validate through the create, add, list, validate journey, and wrong passphrase or wrong kind fail closed before reaching the provider", async () => withVault(async (dir) => {
  const out = join(dir, "journey.age");
  assert.equal((await run(["vault", "create", "--out", out, ...fdArgs(0)], `${passphrase}\n${passphrase}\n`)).code, 0);
  const blockfrostSecret = "journey-blockfrost-secret-value";
  const koiosSecret = "journey-koios-secret-value";
  const addedBlockfrost = await ptyCredentialAdd(out, { provider: "blockfrost", id: "journey-blockfrost", label: "Journey blockfrost", credential: blockfrostSecret });
  assert.equal(addedBlockfrost.code, 0, `${addedBlockfrost.stdout}${addedBlockfrost.stderr}`);
  const addedKoios = await ptyCredentialAdd(out, { provider: "koios", id: "journey-koios", label: "Journey koios", credential: koiosSecret });
  assert.equal(addedKoios.code, 0, `${addedKoios.stdout}${addedKoios.stderr}`);
  const listed = await run(["vault", "list", "--vault", out, "--json", ...fdArgs(0)], `${passphrase}\n`);
  assert.equal(listed.code, 0, listed.stderr);
  const entries = JSON.parse(listed.stdout);
  assert.ok(entries.some((entry) => entry.id === "journey-blockfrost" && entry.kind === "blockfrost-project-id"));
  assert.ok(entries.some((entry) => entry.id === "journey-koios" && entry.kind === "koios-bearer-token"));

  const txFile = join(dir, "transaction.cbor");
  const transactionCbor = (await readFile(new URL("../docs/inspector/tests/fixtures/treasury-reorganize-unsigned-tx.hex", import.meta.url), "utf8")).trim();
  await writeFile(txFile, `${transactionCbor}\n`);
  const capture = join(dir, "journey-capture.json");
  const guard = join(dir, "journey-guard.mjs");
  await writeFile(guard, `import { writeFileSync } from "node:fs"; const calls = []; globalThis.fetch = async (url, options) => { const headers = options?.headers ?? {}; calls.push({ url, hasProjectId: typeof headers.project_id === "string" && headers.project_id.length > 0 }); writeFileSync(process.env.CSK_JOURNEY_CAPTURE, JSON.stringify({ calls })); return { status: 401, text: async () => "provider denied" }; }; process.on("exit", () => writeFileSync(process.env.CSK_JOURNEY_CAPTURE, JSON.stringify({ calls, argv: process.argv, env: process.env })));`);
  const guardEnv = { NODE_OPTIONS: `--import ${new URL(`file://${guard}`).href}`, CSK_JOURNEY_CAPTURE: capture };
  const validateArgs = (entryId) => ["tx", "validate", "--tx-file", txFile, "--provider", "blockfrost", "--network", "mainnet", "--vault", out, "--vault-entry", entryId, "--passphrase-fd", "3", "--output", "json"];

  // This unbundled harness has no WASM engine staged, and tx.inspect always runs before any provider fetch; the header-presence proof lives in node/test/cli.test.mjs's packaged-dist proof instead.
  const selected = await runWithFd3(validateArgs("journey-blockfrost"), `${passphrase}\n`, guardEnv);
  assert.equal(selected.code, 5, selected.stderr);
  assert.equal(JSON.parse(selected.stdout).error.code, "ENGINE_NOT_FOUND");
  const recorded = JSON.parse(await readFile(capture, "utf8"));
  assert.deepEqual(recorded.calls, [], "this harness has no WASM engine, so tx.inspect must fail before any provider request is attempted");
  assert.doesNotMatch(JSON.stringify(recorded), new RegExp(`${blockfrostSecret}|${koiosSecret}|${passphrase}`));

  const wrongPassphrase = await runWithFd3(validateArgs("journey-blockfrost"), "wrong passphrase\n");
  assert.equal(wrongPassphrase.code, 4);
  assert.equal(JSON.parse(wrongPassphrase.stdout).error.code, "SECRET_SOURCE");

  const wrongKind = await runWithFd3(validateArgs("journey-koios"), `${passphrase}\n`);
  assert.equal(wrongKind.code, 4);
  assert.equal(JSON.parse(wrongKind.stdout).error.code, "SECRET_SOURCE");

  for (const result of [selected, wrongPassphrase, wrongKind]) {
    assert.doesNotMatch(`${result.stdout}${result.stderr}`, new RegExp(`${blockfrostSecret}|${koiosSecret}|${passphrase}`));
  }
}));

test("vault credential add rejects unsupported providers, missing or malformed metadata, and every secret-bearing argument form before opening the controlling terminal", async () => withVault(async (dir) => {
  const out = join(dir, "reject.age");
  const base = ["vault", "credential", "add", "--vault", out, "--provider", "blockfrost", "--id", "entry-id", "--label", "Entry label"];
  const swap = (flag, value) => { const args = [...base]; const index = args.indexOf(flag); args[index + 1] = value; return args; };
  const cases = [
    swap("--provider", "amaru"),
    ["vault", "credential", "add", "--vault", out, "--provider", "blockfrost", "--id", "entry-id"],
    ["vault", "credential", "add", "--vault", out, "--provider", "blockfrost", "--label", "Entry label"],
    ["vault", "credential", "add", "--vault", out, "--id", "entry-id", "--label", "Entry label"],
    swap("--id", "   "),
    swap("--id", `bad${controlChar}id`),
    swap("--label", "   "),
    swap("--label", `bad${controlChar}label`),
    [...base, "--credential", secret],
    [...base, "--project-id", secret],
    [...base, "--token", secret],
    [...base, "--secret-stdin"],
    [...base, `PROJECT_ID=${secret}`],
    ["vault", "credential", "remove", "--vault", out, "--id", "entry-id"],
  ];
  for (const args of cases) {
    const result = await run(args);
    assert.notEqual(result.code, 0, args.join(" "));
    assert.match(result.stderr, /Vault arguments are invalid\./, args.join(" "));
    redacted(result);
  }
  await assert.rejects(stat(out));
}));

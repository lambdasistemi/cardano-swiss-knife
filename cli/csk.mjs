#!/usr/bin/env node
import { open, readFile, writeFile } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import { createReadStream } from "node:fs";
import { createVaultFile, listVaultFile, migrateVaultFile } from "./vault-host.mjs";
import { decryptVault } from "../lib/src/Cardano/Vault.js";
import * as address from "../node/src/commands/address.js";
import * as mnemonic from "../node/src/commands/mnemonic.js";
import * as key from "../node/src/commands/key.js";
import * as script from "../node/src/commands/script.js";
import * as payload from "../node/src/commands/payload.js";
import * as tx from "../node/src/commands/tx.js";
const usage = "Usage: csk vault <create|list|migrate> [options]\n\ncsk vault create --out PATH [--passphrase-fd FD] [--force]\ncsk vault list --vault PATH [--passphrase-fd FD] [--json]\ncsk vault migrate --input PATH --out PATH [--input-passphrase-fd FD] [--passphrase-fd FD] [--force]\n";
const txUsage = "Usage: csk tx <inspect|browse|identify|intent|validate|evaluate-scripts> (--cbor-hex HEX | --tx-file PATH | --tx-hash HASH --provider blockfrost|koios --network mainnet|preprod|preview) [--vault PATH --vault-entry ID [--passphrase-fd FD]] [--book PATH ...] [--path JSON-PATH] [--output json]\n\ncsk tx witness plan <transaction-source> [provider options] [--output json]\ncsk tx witness attach <transaction-source> (--witness-file PATH | --vault PATH --vault-entry ID [--passphrase-fd FD]) [--replace-existing] [--tx-out PATH] [--witness-out PATH] [--output json]\n";
const rootUsage = "Usage: csk <address|mnemonic|key|script|payload|tx|vault> ...\n\ncsk address inspect --address ADDRESS\ncsk mnemonic generate|validate\ncsk key derive|address|restore\ncsk script inspect|author|template\ncsk payload sign|verify\n" + txUsage + "\n" + usage;
const bad = () => { throw Error("Vault arguments are invalid."); };
const parse = (args) => { if (args.includes("--help") || args.includes("-h")) return { help: true }; const [group, command, ...rest] = args; const allowed = { create: ["--out", "--passphrase-fd", "--force"], list: ["--vault", "--passphrase-fd", "--json"], migrate: ["--input", "--out", "--input-passphrase-fd", "--passphrase-fd", "--force"] }; if (group !== "vault" || !allowed[command]) bad(); const o = { command }; for (let i = 0; i < rest.length; i += 1) { const key = rest[i]; if (!allowed[command].includes(key) || o[key.slice(2)] !== undefined) bad(); if (["--force", "--json"].includes(key)) o[key.slice(2)] = true; else if (rest[i + 1] && !rest[i + 1].startsWith("--")) o[key.slice(2)] = rest[++i]; else bad(); } if ((command === "create" && !o.out) || (command === "list" && !o.vault) || (command === "migrate" && (!o.input || !o.out)) || [o["passphrase-fd"], o["input-passphrase-fd"]].filter(Boolean).some((fd) => !/^\d+$/.test(fd))) bad(); return o; };
const ttySession = async () => {
  const handle = await open("/dev/tty", "r+");
  const saved = spawnSync("stty", ["-g"], { stdio: [handle.fd, "pipe", "ignore"] }).stdout.toString().trim();
  const restore = () => spawnSync("stty", [saved], { stdio: [handle.fd, "ignore", "ignore"] });
  let active;
  const close = async () => { active?.kill(); await handle.close(); };
  const codes = { SIGINT: 130, SIGTERM: 143, SIGHUP: 129 };
  const handlers = Object.entries(codes).map(([signal, code]) => [signal, () => { restore(); close().finally(() => process.exit(code)); }]);
  handlers.forEach(([signal, handler]) => process.once(signal, handler));
  spawnSync("stty", ["-echo"], { stdio: [handle.fd, "ignore", "ignore"] });
  return {
    ask: (prompt) => new Promise((resolve, reject) => {
      process.stderr.write(`${prompt}: `);
      active = spawn(process.execPath, ["-e", "process.stdin.once('data', x => { process.stdin.destroy(); process.stdout.write(x.toString().replace(/\\r?\\n$/, ''), () => process.exit(0)); })"], { stdio: [handle.fd, "pipe", "ignore"] });
      let value = "";
      active.stdout.on("data", (chunk) => { value += chunk; });
      active.on("error", reject);
      active.on("close", (code) => { active = undefined; code === 0 ? (process.stderr.write("\n"), resolve(value)) : reject(Error("Vault passphrase input is invalid.")); });
    }),
    close: async () => { restore(); handlers.forEach(([signal, handler]) => process.removeListener(signal, handler)); await close(); },
  };
};
const tty = async (prompt) => { const session = await ttySession(); try { return await session.ask(prompt); } finally { await session.close(); } };
const fdText = (fd) => new Promise((resolve, reject) => { let text = ""; const input = createReadStream(null, { fd: Number(fd), autoClose: false }); input.on("data", (x) => { text += x; }); input.on("end", () => resolve(text.replace(/\r?\n$/, ""))); input.on("error", reject); });
const exitFor = (code) => code === "DOMAIN_ERROR" ? 3 : code === "SECRET_SOURCE" ? 4 : code?.startsWith("ENGINE_") ? 5 : code?.startsWith("PROVIDER_") ? 6 : code?.startsWith("BOOK_") || code?.startsWith("RDF_") ? 7 : 4;
const offlineUsage = () => { const error = Error("CLI arguments are invalid."); error.exit = 2; throw error; };
const options = (args) => { const result = {}; for (let i = 0; i < args.length; i += 1) { const flag = args[i]; if (!flag.startsWith("--") || result[flag.slice(2)] !== undefined) offlineUsage(); if (["--secret-stdin"].includes(flag)) result[flag.slice(2)] = true; else { const value = args[++i]; if (value === undefined || value.startsWith("--")) offlineUsage(); result[flag.slice(2)] = value; } } return result; };
const secretFailure = () => { const error = Error("Secret source is invalid."); error.exit = 4; return error; };
const resolvedSecret = (value) => { if (!value) throw secretFailure(); return value; };
const secret = async (o, kind) => { const forms = [o["secret-stdin"], o["secret-fd"], o.vault].filter(Boolean); if (forms.length !== 1 || (o.vault && !o["vault-entry"])) throw secretFailure(); if (o["secret-stdin"]) return resolvedSecret(await fdText(0)); if (o["secret-fd"]) { if (!/^\d+$/.test(o["secret-fd"])) throw secretFailure(); try { return resolvedSecret(await fdText(o["secret-fd"])); } catch { throw secretFailure(); } } try { const passphrase = o["passphrase-fd"] ? await fdText(o["passphrase-fd"]) : await tty("Vault passphrase"); const vault = await decryptVault(passphrase, new Uint8Array(await readFile(o.vault))); const entry = vault.cardanoSwissKnifeVault.entries.filter((item) => item.id === o["vault-entry"])[0]; if (!entry || entry.kind !== kind || typeof entry.value !== "string") throw Error(); return resolvedSecret(entry.value); } catch { throw secretFailure(); } };
const render = (result, json) => { const envelope = { version: 1, ...result }; if (json) process.stdout.write(`${JSON.stringify(envelope)}\n`); else if (result.ok) process.stdout.write(`${typeof result.value === "string" ? result.value : JSON.stringify(result.value)}\n`); else process.stderr.write(`${result.error.message}\n`); return result.ok ? 0 : exitFor(result.error.code); };
const offline = async (args) => { const [family, command, subcommand, ...tail] = args; const hasSubcommand = family === "key" && ["address", "restore"].includes(command); const o = options(hasSubcommand ? tail : [subcommand, ...tail].filter((x) => x !== undefined)); const json = o.output === "json"; delete o.output; if (o.mnemonic || o["signing-key"]) offlineUsage(); let result; if (family === "address" && command === "inspect") result = await address.inspect({ address: o.address }); else if (family === "mnemonic" && command === "generate") result = await mnemonic.generate({ wordCount: o["word-count"] }); else if (family === "mnemonic" && command === "validate") result = await mnemonic.validate({ mnemonic: await secret(o, "mnemonic") }); else if (family === "key" && command === "derive") result = await key.derive({ mnemonic: await secret(o, "mnemonic"), accountIndex: o["account-index"], role: o.role, addressIndex: o["address-index"] }); else if (family === "key" && command === "address" && subcommand === "shelley") result = await key.shelley({ network: o.network, paymentXpub: o["payment-xpub"], stakeXpub: o["stake-xpub"] }); else if (family === "key" && command === "address" && subcommand === "icarus") result = await key.icarus({ network: o.network, addressXpub: o["address-xpub"] }); else if (family === "key" && command === "address" && subcommand === "byron") result = await key.byron({ network: o.network, addressXpub: o["address-xpub"], rootXpub: o["root-xpub"], derivationPath: o["derivation-path"] }); else if (family === "key" && command === "restore" && subcommand === "icarus") result = await key.restoreIcarus({ mnemonic: await secret(o, "mnemonic"), network: o.network, accountIndex: o["account-index"], role: o.role, addressIndex: o["address-index"] }); else if (family === "key" && command === "restore" && subcommand === "byron") result = await key.restoreByron({ mnemonic: await secret(o, "mnemonic"), network: o.network, accountIndex: o["account-index"], addressIndex: o["address-index"] }); else if (family === "script" && command === "inspect") result = await script.inspect({ cborHex: o["cbor-hex"] }); else if (family === "script" && command === "author") result = await script.author({ json: o.json }); else if (family === "script" && command === "template") result = await script.template({ json: o.json }); else if (family === "payload" && command === "sign") result = await payload.sign({ signingKey: await secret(o, "signing-key"), payloadMode: o["payload-mode"], payloadInput: o["payload-input"] }); else if (family === "payload" && command === "verify") result = await payload.verify({ payloadMode: o["payload-mode"], payloadInput: o["payload-input"], verificationKey: o["verification-key"], signature: o.signature }); else offlineUsage(); process.exitCode = render(result, json); };
const txFailure = (code, message, exit = exitFor(code)) => Object.assign(Error(message), { code, exit });
const transaction = async (args) => {
  const [family, firstCommand, ...tail] = args;
  let command = firstCommand; let rest = tail; let attach = false;
  if (command === "evaluate-scripts") command = "evaluateScripts";
  if (command === "witness") {
    const [subcommand, ...witnessRest] = rest;
    if (subcommand === "plan") command = "witnessPlan";
    else if (subcommand === "attach") { command = "attachWitness"; attach = true; }
    else offlineUsage();
    rest = witnessRest;
  }
  if (family !== "tx" || !["inspect", "browse", "identify", "intent", "witnessPlan", "validate", "evaluateScripts", "attachWitness"].includes(command)) offlineUsage();
  if (rest.includes("--help") || rest.includes("-h")) { process.stdout.write(txUsage); return; }
  const values = { book: [] }; const allowed = new Set(["--cbor-hex", "--tx-file", "--tx-hash", "--provider", "--network", "--vault", "--vault-entry", "--passphrase-fd", "--book", "--path", "--output", "--witness-file", "--replace-existing", "--tx-out", "--witness-out"]);
  for (let i = 0; i < rest.length; i += 1) { const flag = rest[i]; const key = flag.slice(2); if (!allowed.has(flag) || (key !== "book" && values[key] !== undefined)) offlineUsage(); if (flag === "--replace-existing") { if (!attach) offlineUsage(); values[key] = true; continue; } if (!rest[i + 1] || rest[i + 1].startsWith("--")) offlineUsage(); const value = rest[++i]; key === "book" ? values.book.push(value) : values[key] = value; }
  if (values.output && values.output !== "json") offlineUsage();
  const sources = [values["cbor-hex"], values["tx-file"], values["tx-hash"]].filter((value) => value !== undefined);
  if (sources.length !== 1 || (command === "browse") !== (values.path !== undefined)) offlineUsage();
  const hash = values["tx-hash"] !== undefined;
  if (hash !== (values.provider !== undefined && values.network !== undefined) || (hash && !["blockfrost", "koios"].includes(values.provider)) || (hash && !["mainnet", "preprod", "preview"].includes(values.network))) offlineUsage();
  if ((values.vault !== undefined) !== (values["vault-entry"] !== undefined) || (values["passphrase-fd"] && (!values.vault || !/^\d+$/.test(values["passphrase-fd"])))) offlineUsage();
  if (attach) {
    if (hash && values.vault && !values["witness-file"]) offlineUsage();
    const witnessSources = Number(values["witness-file"] !== undefined) + Number(!hash && values.vault !== undefined);
    if (witnessSources !== 1 || values.book.length !== 0 || values.path !== undefined) offlineUsage();
  } else if ((!hash && (values.vault || values["vault-entry"] || values["passphrase-fd"])) || values["witness-file"] || values["replace-existing"] || values["tx-out"] || values["witness-out"]) offlineUsage();
  let input;
  try { if (values["cbor-hex"] !== undefined) input = { cborHex: values["cbor-hex"] }; else if (values["tx-file"] !== undefined) { const contents = (await readFile(values["tx-file"], "utf8")).trim(); input = contents.startsWith("{") ? { textEnvelope: JSON.parse(contents) } : { cborHex: contents }; } else { let credential; if (values.provider === "blockfrost") { if (!values.vault) throw secretFailure(); credential = await secret(values, "blockfrost-project-id"); } else if (values.vault) credential = await secret(values, "koios-bearer-token"); input = { txHash: values["tx-hash"], provider: values.provider, network: values.network, ...(credential ? { credential } : {}) }; } } catch (error) { if (error.exit) throw error; throw txFailure("DOMAIN_ERROR", "Transaction input is invalid."); }
  let books; try { books = await Promise.all(values.book.map((path) => readFile(path, "utf8"))); } catch { throw txFailure("BOOK_IMPORT", "Transaction book input is invalid."); }
  let path; try { path = values.path === undefined ? undefined : JSON.parse(values.path); } catch { offlineUsage(); }
  if (attach) {
    let witness; let witnessEnvelope;
    try {
      if (values["witness-file"]) {
        const contents = (await readFile(values["witness-file"], "utf8")).trim();
        witness = contents.startsWith("{") ? { textEnvelope: JSON.parse(contents) } : { cborHex: contents };
        const normalised = await tx.normaliseWitness(witness);
        if (!normalised.ok) { process.exitCode = render(normalised, values.output === "json"); return; }
        witness = { textEnvelope: normalised.value.textEnvelope };
        witnessEnvelope = normalised.value.textEnvelope;
      } else {
        const plan = await tx.witnessPlan(input);
        if (!plan.ok) { process.exitCode = render(plan, values.output === "json"); return; }
        let bodyHashHex = plan.value?.result?.witness_plan?.body_hash ?? plan.value?.witness_plan?.body_hash;
        if (typeof bodyHashHex !== "string") {
          const identified = await tx.identify(input);
          if (!identified.ok) { process.exitCode = render(identified, values.output === "json"); return; }
          bodyHashHex = identified.value?.result?.identification?.body_hash ?? identified.value?.identification?.body_hash;
        }
        if (typeof bodyHashHex !== "string") throw txFailure("ENGINE_PROTOCOL", "The ledger-inspector witness plan response omitted its body hash.");
        const prepared = await tx.prepareWitness({ bodyHashHex, signingKeyBech32: await secret(values, "signing-key") });
        if (!prepared.ok) { process.exitCode = render(prepared, values.output === "json"); return; }
        witness = { textEnvelope: prepared.value.textEnvelope };
        witnessEnvelope = prepared.value.textEnvelope;
      }
    } catch (error) { if (error.exit) throw error; throw txFailure("WITNESS_INPUT", "Detached witness input is invalid."); }
    const result = await tx.attachWitness(input, witness, { replaceExisting: values["replace-existing"] === true });
    if (result.ok) {
      try {
        if (values["tx-out"]) await writeFile(values["tx-out"], `${JSON.stringify(result.value.textEnvelope)}\n`, { mode: 0o600 });
        if (values["witness-out"]) {
          if (!witnessEnvelope) throw txFailure("WITNESS_INPUT", "A detached witness TextEnvelope is required for --witness-out.");
          await writeFile(values["witness-out"], `${JSON.stringify(witnessEnvelope)}\n`, { mode: 0o600 });
        }
      } catch (error) { if (error.exit) throw error; throw txFailure("DOMAIN_ERROR", "Transaction output could not be written."); }
    }
    process.exitCode = render(result, values.output === "json");
    return;
  }
  const result = await tx[command](input, { books, ...(path === undefined ? {} : { path }) });
  process.exitCode = render(result, values.output === "json");
};
try { if (["--help", "-h"].includes(process.argv[2])) process.stdout.write(rootUsage); else if (process.argv[2] === "tx") await transaction(process.argv.slice(2)); else if (process.argv[2] !== "vault") await offline(process.argv.slice(2)); else { const o = parse(process.argv.slice(2)); if (o.help) process.stdout.write(usage); else { const fds = [...new Set([o["input-passphrase-fd"], o["passphrase-fd"]].filter(Boolean))]; const values = new Map(await Promise.all(fds.map(async (fd) => [fd, (await fdText(fd)).split(/\r?\n/)]))); const session = ((o.command === "create" && !o["passphrase-fd"]) || (o.command === "list" && !o["passphrase-fd"]) || (o.command === "migrate" && (!o["input-passphrase-fd"] || !o["passphrase-fd"]))) ? await ttySession() : null; try { const take = async (fd, label) => { const value = fd ? values.get(fd).shift() : await session.ask(label); if (!value) throw Error("Vault passphrase input is invalid."); return value; }; if (o.command === "create") { const pass = await take(o["passphrase-fd"], "Vault passphrase"); const confirm = await take(o["passphrase-fd"], "Confirm vault passphrase"); if (pass !== confirm) throw Error("Vault passphrase confirmation failed."); await createVaultFile(o.out, pass, undefined, o.force); } else if (o.command === "list") { const entries = await listVaultFile(o.vault, await take(o["passphrase-fd"], "Vault passphrase")); process.stdout.write(o.json ? `${JSON.stringify(entries)}\n` : `${entries.map((x) => `${x.id}\t${x.kind}\t${x.label}\t${x.createdAt}`).join("\n")}\n`); } else await migrateVaultFile(o.input, o.out, await take(o["input-passphrase-fd"], "Input vault passphrase"), await take(o["passphrase-fd"], "Vault passphrase"), o.force); } finally { await session?.close(); } } } } catch (error) { const offlineCommand = process.argv[2] !== "vault"; const exit = error.exit ?? (error.code ? exitFor(error.code) : 3); const message = error.message?.startsWith("Vault ") ? error.message : error.message || "CLI input is invalid."; if (offlineCommand && process.argv.includes("--output") && process.argv.includes("json")) { const code = error.code || (exit === 2 ? "USAGE" : exit === 4 ? "SECRET_SOURCE" : "DOMAIN_ERROR"); process.stdout.write(`${JSON.stringify({ version: 1, ok: false, error: { code, message } })}\n`); } else process.stderr.write(`${message}\n`); process.exitCode = offlineCommand ? exit : error.exit || 1; }

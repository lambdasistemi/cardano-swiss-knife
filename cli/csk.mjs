#!/usr/bin/env node
import { open } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import { createReadStream } from "node:fs";
import { createVaultFile, listVaultFile, migrateVaultFile } from "./vault-host.mjs";
const usage = "Usage: csk vault <create|list|migrate> [options]\n\ncsk vault create --out PATH [--passphrase-fd FD] [--force]\ncsk vault list --vault PATH [--passphrase-fd FD] [--json]\ncsk vault migrate --input PATH --out PATH [--input-passphrase-fd FD] [--passphrase-fd FD] [--force]\n";
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
const fdText = (fd) => new Promise((resolve, reject) => { let text = ""; const input = createReadStream(null, { fd: Number(fd), autoClose: false }); input.on("data", (x) => { text += x; }); input.on("end", () => resolve(text.replace(/\r?\n$/, ""))); input.on("error", reject); });
try { const o = parse(process.argv.slice(2)); if (o.help) process.stdout.write(usage); else { const fds = [...new Set([o["input-passphrase-fd"], o["passphrase-fd"]].filter(Boolean))]; const values = new Map(await Promise.all(fds.map(async (fd) => [fd, (await fdText(fd)).split(/\r?\n/)]))); const session = ((o.command === "create" && !o["passphrase-fd"]) || (o.command === "list" && !o["passphrase-fd"]) || (o.command === "migrate" && (!o["input-passphrase-fd"] || !o["passphrase-fd"]))) ? await ttySession() : null; try { const take = async (fd, label) => { const value = fd ? values.get(fd).shift() : await session.ask(label); if (!value) throw Error("Vault passphrase input is invalid."); return value; }; if (o.command === "create") { const pass = await take(o["passphrase-fd"], "Vault passphrase"); const confirm = await take(o["passphrase-fd"], "Confirm vault passphrase"); if (pass !== confirm) throw Error("Vault passphrase confirmation failed."); await createVaultFile(o.out, pass, undefined, o.force); } else if (o.command === "list") { const entries = await listVaultFile(o.vault, await take(o["passphrase-fd"], "Vault passphrase")); process.stdout.write(o.json ? `${JSON.stringify(entries)}\n` : `${entries.map((x) => `${x.id}\t${x.kind}\t${x.label}\t${x.createdAt}`).join("\n")}\n`); } else await migrateVaultFile(o.input, o.out, await take(o["input-passphrase-fd"], "Input vault passphrase"), await take(o["passphrase-fd"], "Vault passphrase"), o.force); } finally { await session?.close(); } } } catch (error) { process.stderr.write(`${error.message?.startsWith("Vault ") ? error.message : "Vault input is invalid."}\n`); process.exitCode = 1; }

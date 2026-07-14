// Aggregate per-scenario judge JSON into a ranked punch-list + one overall score, and
// append the score to history.jsonl so the trend is visible across runs.
import { readdir, readFile, writeFile, appendFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, "out");

function parseJudge(text) {
  const m = text.match(/\{[\s\S]*\}/); // tolerate stray prose / code fences
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

const files = (await readdir(out)).filter((f) => f.endsWith(".judge.txt")).sort();
const judged = [];
for (const f of files) {
  const j = parseJudge(await readFile(path.join(out, f), "utf8"));
  if (j) judged.push(j);
  else console.warn("unparseable judge output:", f);
}

const overall = judged.length
  ? Math.round(judged.reduce((a, j) => a + (j.overall || 0), 0) / judged.length)
  : 0;
const sevRank = { P1: 0, P2: 1, P3: 2 };
const gaps = judged
  .flatMap((j) => (j.gaps || []).map((g) => ({ ...g, scenario: j.scenario })))
  .sort((a, b) => (sevRank[a.severity] ?? 9) - (sevRank[b.severity] ?? 9));

const stamp = process.env.UX_STAMP || "unstamped";
const base = process.env.UX_BASE_URL || "(default: live prod)";
const cols = ["first_impression", "hierarchy", "tree_readability", "affordances", "polish", "first_run"];

let md = `# Ledger Inspector — UX Judge report\n\n`;
md += `- target: ${base}\n- run: ${stamp}\n- **overall usability score: ${overall}/100**\n`;
md += `- gaps: ${gaps.filter((g) => g.severity === "P1").length} P1 / ${gaps.filter((g) => g.severity === "P2").length} P2 / ${gaps.filter((g) => g.severity === "P3").length} P3\n\n`;
md += `## Per-scenario scores\n\n| scenario | overall | ${cols.join(" | ")} |\n|---|---|${cols.map(() => "---").join("|")}|\n`;
for (const j of judged) {
  const s = j.scores || {};
  md += `| ${j.scenario} | ${j.overall ?? "-"} | ${cols.map((c) => s[c] ?? "-").join(" | ")} |\n`;
}
md += `\n## Ranked punch-list (${gaps.length})\n\n`;
for (const g of gaps) {
  md += `### ${g.severity} — ${g.area} \`${g.scenario}\`\n- **what:** ${g.what}\n- **why:** ${g.why}\n- **fix:** ${g.fix}\n\n`;
}

await writeFile(path.join(out, "report.md"), md);
await appendFile(
  path.join(here, "history.jsonl"),
  JSON.stringify({ stamp, base, overall, scenarios: judged.map((j) => ({ s: j.scenario, o: j.overall })) }) + "\n",
);
console.log(`overall ${overall}/100 — ${gaps.length} gaps -> out/report.md`);

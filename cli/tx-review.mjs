const scalar = (value) => value === null || value === undefined ? "(not reported)" : typeof value === "boolean" ? (value ? "yes" : "no") : String(value);
const fieldLines = (rows, indent) => {
  const width = Math.max(...rows.map(([label]) => label.length));
  return rows.map(([label, value]) => `${" ".repeat(indent)}${label.padEnd(width)}  ${value}`);
};
const listLines = (items, indent) => (items.length === 0 ? [`${" ".repeat(indent)}(none)`] : items.map((item) => `${" ".repeat(indent)}${item}`));
const groupLines = (group, name, index, total) => {
  const evidence = Array.isArray(group.evidence) ? group.evidence : [];
  const indices = Array.isArray(group.output_indices) ? group.output_indices : [];
  const addresses = Array.isArray(group.addresses) ? group.addresses : [];
  const rows = [
    ["category", scalar(group.category)],
    ["role", scalar(group.role)],
    ["role provenance", scalar(group.role_provenance)],
    ["evidence", evidence.length === 0 ? "(none)" : evidence.join(", ")],
    ["lovelace", scalar(group.lovelace)],
    ["distinct non-ADA asset classes", scalar(group.asset_class_count)],
    ["outputs", `${scalar(group.output_count)} (indices ${indices.join(", ")})`],
  ];
  const width = Math.max(...rows.map(([label]) => label.length), "addresses".length);
  return [
    `  ${name} ${index + 1} of ${total}`,
    ...rows.map(([label, value]) => `    ${label.padEnd(width)}  ${value}`),
    "    addresses",
    ...listLines(addresses, 6),
  ];
};
const claimLines = (claim, index, total) => {
  const rows = [
    ["label", scalar(claim.label)],
    ["value", scalar(claim.value)],
    ["detail", scalar(claim.detail)],
    ["self declared", scalar(claim.self_declared)],
  ];
  const width = Math.max(...rows.map(([label]) => label.length));
  return [`  claim ${index + 1} of ${total}`, ...rows.map(([label, value]) => `    ${label.padEnd(width)}  ${value}`)];
};
const resolutionLines = (resolution, index, total) => {
  const rows = [
    ["identifier", scalar(resolution.raw)],
    ["label", scalar(resolution.label)],
    ["type", scalar(resolution.type)],
  ];
  const width = Math.max(...rows.map(([label]) => label.length));
  return [`  resolution ${index + 1} of ${total}`, ...rows.map(([label, value]) => `    ${label.padEnd(width)}  ${value}`)];
};
const KNOWN_REVIEW_KEYS = new Set(["version", "tx_id", "body_hash", "context", "sources", "control_groups", "high_value_movements", "fee", "collateral", "net_signer_value", "claims", "warnings"]);
const additionalLines = (review) => {
  const extra = Object.keys(review).filter((key) => !KNOWN_REVIEW_KEYS.has(key));
  if (extra.length === 0) return [];
  const lines = ["Additional inspector fields"];
  for (const key of extra) {
    lines.push(`  ${key}:`);
    for (const jsonLine of JSON.stringify(review[key], null, 2).split("\n")) lines.push(`    ${jsonLine}`);
  }
  return lines;
};
const SOURCE_FIELDS = {
  regular_input: [["count", "count"], ["resolved", "resolved_count"], ["missing", "missing_count"], ["resolved lovelace", "resolved_lovelace"]],
  withdrawal: [["count", "count"], ["lovelace", "lovelace"]],
  collateral: [["conditional", "conditional"], ["inputs", "input_count"], ["body total lovelace", "body_total_lovelace"], ["return lovelace", "return_lovelace"]],
  reference_input: [["count", "count"], ["read only", "read_only"]],
};
const sourceValue = (value) => value !== null && typeof value === "object" ? JSON.stringify(value) : scalar(value);
const sourceLine = (source, kindWidth) => {
  const kind = typeof source.kind === "string" ? source.kind : "";
  const fields = Object.hasOwn(SOURCE_FIELDS, kind) ? SOURCE_FIELDS[kind] : Object.keys(source).filter((key) => key !== "kind").map((key) => [key, key]);
  const parts = fields.filter(([, key]) => source[key] !== undefined).map(([label, key]) => `${label} ${sourceValue(source[key])}`);
  return `  ${kind.padEnd(kindWidth)}  ${parts.join("  ")}`;
};
export const renderTransactionReview = (envelope) => {
  const review = envelope.result.review ?? {};
  const context = review.context ?? {};
  const netSignerValue = review.net_signer_value ?? {};
  const fee = review.fee ?? {};
  const warnings = Array.isArray(review.warnings) ? review.warnings : [];
  const sections = [];
  sections.push([`csk tx review — ${scalar(review.version)}`]);
  sections.push(["Transaction", ...fieldLines([
    ["tx id", scalar(review.tx_id)],
    ["body hash", scalar(review.body_hash)],
    ["fee", fee.lovelace === null || fee.lovelace === undefined ? "(not reported)" : `${fee.lovelace} lovelace`],
  ], 2)]);
  sections.push(["What is not proven", ...fieldLines([
    ["input context status", scalar(context.input_status)],
    ["regular inputs", scalar(context.regular_input_count)],
    ["resolved regular inputs", scalar(context.resolved_regular_input_count)],
    ["missing regular inputs", scalar(context.missing_regular_input_count)],
    ["net signer value provable", scalar(netSignerValue.provable)],
    ["net signer value lovelace", scalar(netSignerValue.lovelace)],
    ["net signer value note", scalar(netSignerValue.note)],
  ], 2)]);
  sections.push([`Warnings (${warnings.length})`, ...listLines(warnings, 2)]);
  const controlGroups = Array.isArray(review.control_groups) ? review.control_groups : [];
  const movements = Array.isArray(review.high_value_movements) ? review.high_value_movements : [];
  sections.push([`Output control groups (${controlGroups.length})`, ...(controlGroups.length === 0 ? listLines([], 2) : controlGroups.flatMap((group, index) => groupLines(group, "group", index, controlGroups.length)))]);
  sections.push([`High-value movements (${movements.length})`, ...(movements.length === 0 ? listLines([], 2) : movements.flatMap((movement, index) => groupLines(movement, "movement", index, movements.length)))]);
  const sources = Array.isArray(review.sources) ? review.sources : [];
  const collateral = review.collateral ?? {};
  const kindWidth = sources.length === 0 ? 0 : Math.max(...sources.map((source) => (typeof source.kind === "string" ? source.kind.length : 0)));
  sections.push([`Sources (${sources.length})`, ...(sources.length === 0 ? listLines([], 2) : sources.map((source) => sourceLine(source, kindWidth)))]);
  sections.push(["Collateral", ...fieldLines([
    ["conditional", scalar(collateral.conditional)],
    ["input count", scalar(collateral.input_count)],
    ["body total lovelace", scalar(collateral.body_total_lovelace)],
    ["return lovelace", scalar(collateral.return_lovelace)],
  ], 2)]);
  const claims = Array.isArray(review.claims) ? review.claims : [];
  sections.push([`Claims (${claims.length})`, ...(claims.length === 0 ? listLines([], 2) : claims.flatMap((claim, index) => claimLines(claim, index, claims.length)))]);
  if (Object.hasOwn(envelope, "resolutions")) {
    const resolutions = Array.isArray(envelope.resolutions) ? envelope.resolutions : [];
    sections.push([`Book resolutions (${resolutions.length}, in caller book order; duplicates preserved)`, ...(resolutions.length === 0 ? listLines([], 2) : resolutions.flatMap((resolution, index) => resolutionLines(resolution, index, resolutions.length)))]);
  }
  const additional = additionalLines(review);
  if (additional.length > 0) sections.push(additional);
  return sections.map((section) => section.join("\n")).join("\n\n");
};

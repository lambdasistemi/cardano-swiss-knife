const lovelace = (value) => `${value} lovelace`;

const renderOutput = (output, index) => {
  const bucket = output.bucket === "signer_controlled" ? "change" : "recipient/script";
  const assetEntries = Object.entries(output.assets ?? {}).flatMap(([policy, assets]) =>
    Object.entries(assets).map(([asset, amount]) => `${policy}.${asset}=${amount}`));
  const assets = assetEntries.length === 0 ? "none" : assetEntries.join(", ");
  return [
    `  [${index}] ${bucket} ${output.address_hex} ${lovelace(output.coin_lovelace)}`,
    `      assets: ${assets}`,
  ].join("\n");
};

const witnessHash = (entry) => typeof entry === "string" ? entry : entry?.hash;

const renderSigner = (signer, missingHashes, labels) => {
  const label = labels.get(signer.hash);
  const status = missingHashes.has(signer.hash) ? "missing" : "present";
  return `  ${signer.hash}${label ? ` (${label})` : ""} - ${status}`;
};

const renderClaim = (claim) => [
  `  ${claim.label}: ${claim.value}`,
  `    ${claim.detail}`,
].join("\n");

const renderResolution = (resolution) => `  ${resolution.raw} -> ${resolution.label}${resolution.type ? ` [${resolution.type}]` : ""}`;

const renderMissing = (row) => `  ${row.path.join(".")} ${row.kind} - ${row.message}`;

export const renderTransactionReview = (evidence) => {
  const { inspection, intent, witnessPlan, validation, resolutions } = evidence;
  const labels = new Map(resolutions.map((resolution) => [resolution.raw, resolution.label]));
  const missingHashes = new Set((witnessPlan.missing_vkey_witnesses ?? []).map(witnessHash));

  const lines = [];
  lines.push(`Transaction: ${intent.tx_id}`);
  lines.push(`Inputs: ${inspection.input_count} regular / ${inspection.reference_input_count} reference`);
  lines.push(`Outputs: ${inspection.output_count}`);
  lines.push(`Fee: ${lovelace(inspection.fee_lovelace)}`);
  lines.push(`Validity: ${inspection.validity_interval.invalid_before ?? "none"} - ${inspection.validity_interval.invalid_hereafter ?? "none"}`);
  lines.push("");

  lines.push("Outputs:");
  lines.push(...intent.value.outputs.map((output, index) => renderOutput(output, index)));
  lines.push("");

  const collateralEffect = intent.effects.find((effect) => effect.label === "Collateral");
  lines.push(`Collateral: ${collateralEffect.detail || collateralEffect.value}`);
  lines.push("");

  lines.push("Required signers:");
  if (witnessPlan.required_signers.length === 0) lines.push("  none declared");
  else lines.push(...witnessPlan.required_signers.map((signer) => renderSigner(signer, missingHashes, labels)));
  lines.push("");

  lines.push("Metadata claims:");
  if (intent.claims.length === 0) lines.push("  none");
  else lines.push(...intent.claims.map(renderClaim));
  lines.push("");

  lines.push("Book resolutions:");
  if (resolutions.length === 0) lines.push("  none");
  else lines.push(...resolutions.map(renderResolution));
  lines.push("");

  lines.push(`Ledger preflight: ${validation.status === "incomplete" ? "incomplete" : "completed"}`);
  if (validation.status === "incomplete") {
    lines.push("  Missing:");
    lines.push(...validation.missing_context.map(renderMissing));
  } else {
    lines.push(`  Verdict: ${validation.status}`);
  }

  return lines.join("\n");
};

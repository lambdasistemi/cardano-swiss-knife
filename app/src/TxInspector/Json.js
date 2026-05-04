export const prettyImpl = (text) => {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch (_err) {
    return text;
  }
};

export const parseJsonImpl = (raw) => (onOk) => (onError) => {
  try {
    return onOk(JSON.parse(raw));
  } catch (_err) {
    return onError;
  }
};

export const operationArgsWithPathImpl = (argsText) => (pathText) => {
  let args = {};
  try {
    const parsedArgs = JSON.parse(argsText);
    if (parsedArgs && typeof parsedArgs === "object" && !Array.isArray(parsedArgs)) {
      args = parsedArgs;
    }
  } catch (_err) {
    args = {};
  }

  try {
    const path = JSON.parse(pathText);
    args.path = Array.isArray(path) ? path.map(String) : [];
  } catch (_err) {
    args.path = [];
  }

  return JSON.stringify(args);
};

const pathRoot = "[]";

const text = (value) => (value === null || value === undefined ? "" : String(value));

const shortHex = (value, head = 12, tail = 8) => {
  const s = text(value);
  if (s.length <= head + tail + 1) return s;
  return `${s.slice(0, head)}...${s.slice(-tail)}`;
};

const formatLovelace = (value) => {
  const raw = text(value);
  if (raw === "") return "n/a";

  try {
    const lovelace = BigInt(raw);
    const ada = lovelace / 1000000n;
    const fraction = (lovelace % 1000000n)
      .toString()
      .padStart(6, "0")
      .replace(/0+$/, "");

    return fraction === "" ? `${ada} ADA` : `${ada}.${fraction} ADA`;
  } catch (_err) {
    return raw;
  }
};

const metric = (label, value) => ({ label, value: text(value) });

const policyEntries = (assets) =>
  assets && typeof assets === "object" && !Array.isArray(assets)
    ? Object.entries(assets)
    : [];

const assetCount = (assets) =>
  policyEntries(assets).reduce((total, [, policyAssets]) => {
    if (!policyAssets || typeof policyAssets !== "object") return total;
    return total + Object.keys(policyAssets).length;
  }, 0);

const policyCount = (assets) => policyEntries(assets).length;

const plural = (count, singular, pluralText = `${singular}s`) =>
  `${count} ${count === 1 ? singular : pluralText}`;

const assetLabel = (assets) => {
  const assetsN = assetCount(assets);
  const policiesN = policyCount(assets);
  if (assetsN === 0) return "none";
  return `${plural(assetsN, "asset")} / ${plural(policiesN, "policy", "policies")}`;
};

const datumLabel = (datum) => {
  if (!datum || typeof datum !== "object") return "unknown";
  switch (datum.kind) {
    case "no_datum":
      return "none";
    case "datum_hash":
      return `hash ${shortHex(datum.hash)}`;
    case "inline_datum":
      return "inline datum";
    default:
      return text(datum.kind || "unknown").replace(/_/g, " ");
  }
};

const txInLabel = (input) => {
  if (!input || typeof input !== "object") return text(input);
  return `${shortHex(input.tx_id)}#${text(input.index)}`;
};

const validityLabel = (slot) => (slot === null || slot === undefined ? "open" : text(slot));

const emptyInspection = (title, subtitle = "") => ({
  valid: false,
  title,
  subtitle,
  metrics: [],
  outputs: [],
  inputs: [],
  referenceInputs: [],
  outputNote: "",
  inputNote: "",
});

const invalidIdentification = (title, subtitle) => ({
  valid: false,
  title,
  subtitle,
  primary: [],
  witnesses: [],
});

const invalidWitnessPlan = (title, subtitle) => ({
  valid: false,
  title,
  subtitle,
  metrics: [],
  warnings: [],
  sections: [],
});

const invalidBrowser = (title, subtitle, currentJson = "") => ({
  valid: false,
  title,
  subtitle,
  currentPath: pathRoot,
  currentJson,
  breadcrumbs: [{ label: "tx", path: pathRoot }],
  rows: [],
});

const jsonCopy = (value) => {
  try {
    return JSON.stringify(value);
  } catch (_err) {
    return text(value);
  }
};

const identifyPath = (...segments) => JSON.stringify(["identification", ...segments]);
const witnessPlanPath = (...segments) => JSON.stringify(["witness_plan", ...segments]);

const identityRow = (label, value, path, copyValue = value) => ({
  label,
  value: text(value),
  copyValue: text(copyValue),
  path,
});

const witnessCount = (counts, key) => {
  const value = counts && typeof counts === "object" ? counts[key] : 0;
  return value === null || value === undefined ? 0 : value;
};

const normalizeIdentification = (identification) => {
  if (!identification || typeof identification !== "object") {
    return invalidIdentification(
      "Transaction identity",
      "Ledger operation response missing identification."
    );
  }

  const counts =
    identification.witness_counts && typeof identification.witness_counts === "object"
      ? identification.witness_counts
      : {};
  const fee = identification.fee_lovelace;
  const size = identification.tx_size_bytes;
  const sizeLabel =
    size === null || size === undefined || size === "" ? "n/a" : `${text(size)} bytes`;

  return {
    valid: true,
    title: `${text(identification.era || "Conway")} transaction identity`,
    subtitle: `${shortHex(identification.tx_id)} / ${formatLovelace(fee)} / ${sizeLabel}`,
    primary: [
      identityRow("Transaction ID", identification.tx_id, identifyPath("tx_id")),
      identityRow("Body hash", identification.body_hash, identifyPath("body_hash")),
      identityRow("CBOR size", sizeLabel, identifyPath("tx_size_bytes"), size),
      identityRow("Fee", formatLovelace(fee), identifyPath("fee_lovelace"), fee),
      identityRow("Inputs", identification.input_count ?? 0, identifyPath("input_count")),
      identityRow(
        "Reference inputs",
        identification.reference_input_count ?? 0,
        identifyPath("reference_input_count")
      ),
      identityRow("Outputs", identification.output_count ?? 0, identifyPath("output_count")),
      identityRow(
        "Required signers",
        identification.required_signer_count ?? 0,
        identifyPath("required_signer_count")
      ),
    ],
    witnesses: [
      identityRow("VKey", witnessCount(counts, "vkey"), identifyPath("witness_counts", "vkey")),
      identityRow(
        "Bootstrap",
        witnessCount(counts, "bootstrap"),
        identifyPath("witness_counts", "bootstrap")
      ),
      identityRow(
        "Native scripts",
        witnessCount(counts, "native_script"),
        identifyPath("witness_counts", "native_script")
      ),
      identityRow(
        "Redeemers",
        witnessCount(counts, "redeemer"),
        identifyPath("witness_counts", "redeemer")
      ),
      identityRow("Datums", witnessCount(counts, "datum"), identifyPath("witness_counts", "datum")),
    ],
  };
};

const witnessRow = (label, value, path, copyValue = value, detail = "") => ({
  label,
  value: text(value),
  copyValue: text(copyValue),
  path,
  detail: text(detail),
});

const sourceDetail = (item) => text(item && item.source ? item.source : "");

const signerRows = (items, pathRootName) =>
  (Array.isArray(items) ? items : []).map((item, index) =>
    witnessRow(
      sourceDetail(item) || `#${index}`,
      item?.hash,
      witnessPlanPath(pathRootName, `#${index}`, "hash"),
      item?.hash,
      sourceDetail(item)
    )
  );

const resolvedTxInLabel = (item) => item?.key || `${item?.tx_id || ""}#${text(item?.index)}`;

const resolvedTxInRows = (items, pathRootName) =>
  (Array.isArray(items) ? items : []).map((item, index) => {
    const key = resolvedTxInLabel(item);
    const status = item?.resolved === true ? "resolved" : "missing";
    const txOut = item?.tx_out && typeof item.tx_out === "object" ? item.tx_out : {};
    const address = txOut.address_hex ? shortHex(txOut.address_hex, 18, 10) : "";
    const lovelace = txOut.coin_lovelace ? formatLovelace(txOut.coin_lovelace) : "";
    const reason = item?.reason ? text(item.reason) : "";
    const detailParts = [status, lovelace, address, reason].filter((part) => part !== "");
    return witnessRow(
      status,
      key,
      witnessPlanPath(pathRootName, `#${index}`, "key"),
      key,
      detailParts.join(" / ")
    );
  });

const normalizeWitnessPlan = (plan) => {
  if (!plan || typeof plan !== "object") {
    return invalidWitnessPlan("Witness plan", "Ledger operation response missing witness plan.");
  }

  const summary = plan.summary && typeof plan.summary === "object" ? plan.summary : {};
  const requiredSigners = Array.isArray(plan.required_signers) ? plan.required_signers : [];
  const vkeyWitnesses = Array.isArray(plan.present_vkey_witnesses) ? plan.present_vkey_witnesses : [];
  const bootstrapWitnesses = Array.isArray(plan.present_bootstrap_witnesses)
    ? plan.present_bootstrap_witnesses
    : [];
  const missingWitnesses = Array.isArray(plan.missing_vkey_witnesses) ? plan.missing_vkey_witnesses : [];
  const scripts = Array.isArray(plan.scripts) ? plan.scripts : [];
  const redeemers = Array.isArray(plan.redeemers) ? plan.redeemers : [];
  const datums = Array.isArray(plan.datums) ? plan.datums : [];
  const resolvedInputs = Array.isArray(plan.resolved_inputs) ? plan.resolved_inputs : [];
  const resolvedReferenceInputs = Array.isArray(plan.resolved_reference_inputs)
    ? plan.resolved_reference_inputs
    : [];
  const warnings = Array.isArray(plan.warnings) ? plan.warnings.map(text) : [];

  const missingCount = Number(summary.missing_vkey_witness_count ?? missingWitnesses.length);
  const presentCount =
    Number(summary.present_vkey_witness_count ?? vkeyWitnesses.length) +
    Number(summary.present_bootstrap_witness_count ?? bootstrapWitnesses.length);

  return {
    valid: true,
    title: "Witness plan",
    subtitle:
      missingCount > 0
        ? `${missingCount} missing declared signer${missingCount === 1 ? "" : "s"}`
        : `${presentCount} present key witness${presentCount === 1 ? "" : "es"}`,
    metrics: [
      metric("Required signers", summary.required_signer_count ?? requiredSigners.length),
      metric("VKey witnesses", summary.present_vkey_witness_count ?? vkeyWitnesses.length),
      metric(
        "Bootstrap witnesses",
        summary.present_bootstrap_witness_count ?? bootstrapWitnesses.length
      ),
      metric("Missing signers", summary.missing_vkey_witness_count ?? missingWitnesses.length),
      metric("Scripts", summary.script_count ?? scripts.length),
      metric("Redeemers", summary.redeemer_count ?? redeemers.length),
      metric("Datums", summary.datum_count ?? datums.length),
    ],
    warnings,
    sections: [
      {
        title: "Required signers",
        empty: "None declared.",
        rows: signerRows(requiredSigners, "required_signers"),
      },
      {
        title: "Missing declared signers",
        empty: "None missing.",
        rows: missingWitnesses.map((item, index) =>
          witnessRow(
            item?.reason || `#${index}`,
            item?.hash,
            witnessPlanPath("missing_vkey_witnesses", `#${index}`, "hash"),
            item?.hash,
            item?.reason
          )
        ),
      },
      {
        title: "Present vkey witnesses",
        empty: "None present.",
        rows: signerRows(vkeyWitnesses, "present_vkey_witnesses"),
      },
      {
        title: "Present bootstrap witnesses",
        empty: "None present.",
        rows: signerRows(bootstrapWitnesses, "present_bootstrap_witnesses"),
      },
      {
        title: "Resolved inputs",
        empty: "No input UTxO context supplied.",
        rows: resolvedTxInRows(resolvedInputs, "resolved_inputs"),
      },
      {
        title: "Resolved reference inputs",
        empty: "No reference input UTxO context supplied.",
        rows: resolvedTxInRows(resolvedReferenceInputs, "resolved_reference_inputs"),
      },
      {
        title: "Script witnesses",
        empty: "None in the witness set.",
        rows: scripts.map((item, index) =>
          witnessRow(
            item?.language || `#${index}`,
            item?.hash,
            witnessPlanPath("scripts", `#${index}`, "hash"),
            item?.hash,
            sourceDetail(item)
          )
        ),
      },
      {
        title: "Redeemers",
        empty: "None present.",
        rows: redeemers.map((item, index) => {
          const exUnits = item?.ex_units && typeof item.ex_units === "object" ? item.ex_units : {};
          return witnessRow(
            item?.purpose || `#${index}`,
            item?.redeemer_data_hash,
            witnessPlanPath("redeemers", `#${index}`, "redeemer_data_hash"),
            item?.redeemer_data_hash,
            `mem ${text(exUnits.memory ?? 0)} / steps ${text(exUnits.steps ?? 0)}`
          );
        }),
      },
      {
        title: "Datums",
        empty: "None in the witness set.",
        rows: datums.map((item, index) =>
          witnessRow(
            sourceDetail(item) || `#${index}`,
            item?.hash,
            witnessPlanPath("datums", `#${index}`, "hash"),
            item?.hash,
            sourceDetail(item)
          )
        ),
      },
    ],
  };
};

export const inspectImpl = (raw) => {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (_err) {
    return emptyInspection("Raw output", "The decoder did not return JSON.");
  }

  const result = parsed?.result?.inspection ?? parsed?.inspection ?? parsed;
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    return emptyInspection("Raw output", "The decoder returned a non-object JSON value.");
  }

  const outputs = Array.isArray(result.outputs) ? result.outputs : [];
  const inputs = Array.isArray(result.inputs) ? result.inputs : [];
  const referenceInputs = Array.isArray(result.reference_inputs) ? result.reference_inputs : [];
  const validity =
    result.validity_interval && typeof result.validity_interval === "object"
      ? result.validity_interval
      : {};

  const outputRows = outputs.slice(0, 8).map((output, index) => ({
    index: `#${index}`,
    address: shortHex(output?.address_hex, 18, 10),
    coin: formatLovelace(output?.coin_lovelace),
    assets: assetLabel(output?.assets),
    datum: datumLabel(output?.datum),
  }));

  return {
    valid: true,
    title: `${text(result.era || "Decoded")} transaction`,
    subtitle: text(result.decoder || ""),
    metrics: [
      metric("Fee", formatLovelace(result.fee_lovelace)),
      metric("Inputs", result.input_count ?? inputs.length),
      metric("Reference inputs", result.reference_input_count ?? referenceInputs.length),
      metric("Outputs", result.output_count ?? outputs.length),
      metric("Required signers", result.required_signer_count ?? 0),
      metric("Certificates", result.cert_count ?? 0),
      metric("Withdrawals", result.withdrawal_count ?? 0),
      metric("Valid from", validityLabel(validity.invalid_before)),
      metric("Valid until", validityLabel(validity.invalid_hereafter)),
    ],
    outputs: outputRows,
    inputs: inputs.slice(0, 8).map(txInLabel),
    referenceInputs: referenceInputs.slice(0, 8).map(txInLabel),
    outputNote:
      outputs.length > outputRows.length
        ? `Showing first ${outputRows.length} of ${outputs.length} outputs.`
        : "",
    inputNote:
      inputs.length + referenceInputs.length > 16
        ? "Input previews are truncated."
        : "",
  };
};

const normalizeBrowser = (browser) => {
  if (!browser || typeof browser !== "object") {
    return invalidBrowser("Transaction browser", "Ledger operation response missing browser.");
  }

  return {
    valid: browser.valid === true,
    title: String(browser.title ?? "tx"),
    subtitle: String(browser.subtitle ?? ""),
    currentPath: String(browser.currentPath ?? pathRoot),
    currentJson: String(browser.currentJson ?? ""),
    breadcrumbs: Array.isArray(browser.breadcrumbs)
      ? browser.breadcrumbs.map((crumb) => ({
          label: String(crumb?.label ?? "tx"),
          path: String(crumb?.path ?? pathRoot),
        }))
      : [{ label: "tx", path: pathRoot }],
    rows: Array.isArray(browser.rows)
      ? browser.rows.map((row) => ({
          label: String(row?.label ?? ""),
          path: String(row?.path ?? pathRoot),
          kind: String(row?.kind ?? ""),
          summary: String(row?.summary ?? ""),
          copyValue: String(row?.copyValue ?? ""),
          canDive: row?.canDive === true,
        }))
      : [],
  };
};

const operationResult = (parsed) => parsed?.result ?? parsed;

export const operationBrowserImpl = (raw) => {
  try {
    const parsed = JSON.parse(raw);
    return normalizeBrowser(operationResult(parsed)?.browser);
  } catch (_err) {
    return invalidBrowser("Transaction browser", "Ledger operation response was not JSON.", raw);
  }
};

export const operationIdentificationImpl = (raw) => {
  try {
    const parsed = JSON.parse(raw);
    return normalizeIdentification(operationResult(parsed)?.identification);
  } catch (_err) {
    return invalidIdentification(
      "Transaction identity",
      "Ledger operation response was not JSON."
    );
  }
};

export const operationWitnessPlanImpl = (raw) => {
  try {
    const parsed = JSON.parse(raw);
    return normalizeWitnessPlan(operationResult(parsed)?.witness_plan);
  } catch (_err) {
    return invalidWitnessPlan("Witness plan", "Ledger operation response was not JSON.");
  }
};

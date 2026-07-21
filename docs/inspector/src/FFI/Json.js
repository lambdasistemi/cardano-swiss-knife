// Pretty-print a JSON string by parsing + re-stringifying with 2-space indent.
// If the input isn't valid JSON, return it unchanged.
export const prettyImpl = (text) => {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch (e) {
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

const objectFromJson = (textValue) => {
  try {
    const parsed = JSON.parse(textValue);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch (_err) {
    // Fall through to the empty args object.
  }
  return {};
};

export const operationArgsMergedImpl = (leftText) => (rightText) => {
  const left = objectFromJson(leftText);
  const right = objectFromJson(rightText);
  const leftContext =
    left.context && typeof left.context === "object" && !Array.isArray(left.context)
      ? left.context
      : {};
  const rightContext =
    right.context && typeof right.context === "object" && !Array.isArray(right.context)
      ? right.context
      : {};
  const context = { ...leftContext, ...rightContext };
  const merged = { ...left, ...right };

  if (Object.keys(context).length > 0) {
    merged.context = context;
  }

  return JSON.stringify(merged);
};

export const providerResolutionErrorArgsImpl = (provider) => (error) =>
  JSON.stringify({
    input_policy: "preserve",
    context: {
      resolution: {
        provider: text(provider).toLowerCase(),
        source: "tx-cbor",
        requested_input_count: 0,
        requested_reference_input_count: 0,
        requested_tx_count: 0,
        resolved_count: 0,
        missing: [],
        errors: [`provider context: ${text(error)}`],
        unspent_status: "not_checked",
      },
    },
  });

const emptyInspection = (title, subtitle = "") => ({
  valid: false,
  title,
  subtitle,
  metrics: [],
  outputs: [],
  mint: [],
  inputs: [],
  referenceInputs: [],
  outputNote: "",
  mintNote: "",
  inputNote: "",
});

const text = (value) =>
  value === null || value === undefined ? "" : String(value);

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

const invalidIdentification = (title, subtitle) => ({
  valid: false,
  title,
  subtitle,
  primary: [],
  witnesses: [],
});

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
  const title = `${text(identification.era || "Conway")} transaction identity`;
  const subtitle = `${shortHex(identification.tx_id)} / ${formatLovelace(fee)} / ${sizeLabel}`;

  return {
    valid: true,
    title,
    subtitle,
    primary: [
      identityRow(
        "Transaction ID",
        identification.tx_id,
        identifyPath("tx_id")
      ),
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
      identityRow("Certificates", identification.cert_count ?? 0, identifyPath("cert_count")),
      identityRow(
        "Withdrawals",
        identification.withdrawal_count ?? 0,
        identifyPath("withdrawal_count")
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
        "Plutus V1",
        witnessCount(counts, "plutus_v1"),
        identifyPath("witness_counts", "plutus_v1")
      ),
      identityRow(
        "Plutus V2",
        witnessCount(counts, "plutus_v2"),
        identifyPath("witness_counts", "plutus_v2")
      ),
      identityRow(
        "Plutus V3",
        witnessCount(counts, "plutus_v3"),
        identifyPath("witness_counts", "plutus_v3")
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

const invalidWitnessPlan = (title, subtitle) => ({
  valid: false,
  title,
  subtitle,
  metrics: [],
  warnings: [],
  sections: [],
  resolvedInputs: [],
});

const invalidValidation = (title, subtitle) => ({
  valid: false,
  title,
  subtitle,
  status: "unknown",
  complete: false,
  validForSuppliedContext: false,
  contextErrors: [],
  metrics: [],
  warnings: [],
  sections: [],
});

const invalidScriptEvaluation = (title, subtitle) => ({
  valid: false,
  title,
  subtitle,
  status: "unknown",
  redeemers: [],
  missingContext: [],
});

const uniqueIdentifierCandidates = (values) =>
  Array.from(new Set(values.map(text).filter((value) => value !== "")));

const keyIdentifierCandidates = (value) => {
  const hash = text(value).toLowerCase();
  return hash === ""
    ? []
    : uniqueIdentifierCandidates([hash, `urn:cardano:id:key:${hash}`]);
};

const witnessRow = (
  label,
  value,
  path,
  copyValue = value,
  detail = "",
  identifierCandidates = []
) => ({
  label,
  value: text(value),
  copyValue: text(copyValue),
  path,
  detail: text(detail),
  identifierCandidates: uniqueIdentifierCandidates(identifierCandidates),
});

const sourceDetail = (item) => text(item && item.source ? item.source : "");
const validationPath = (...segments) => JSON.stringify(["validation", ...segments]);

const signerRows = (items, pathRoot) =>
  (Array.isArray(items) ? items : []).map((item, index) =>
    witnessRow(
      sourceDetail(item) || `#${index}`,
      item?.hash,
      witnessPlanPath(pathRoot, `#${index}`, "hash"),
      item?.hash,
      sourceDetail(item),
      keyIdentifierCandidates(item?.hash)
    )
  );

const resolvedTxInLabel = (item) => item?.key || `${item?.tx_id || ""}#${text(item?.index)}`;
const resolvedInput = (item, kind) => {
  const txOut = item?.tx_out && typeof item.tx_out === "object" ? item.tx_out : {};
  const assets = Object.entries(txOut.assets || {}).flatMap(([policyId, names]) =>
    Object.entries(names || {}).map(([assetName, quantity]) => ({ policyId: text(policyId), assetName: text(assetName), quantity: text(quantity) }))
  ).sort((a, b) => `${a.policyId}:${a.assetName}`.localeCompare(`${b.policyId}:${b.assetName}`));
  return { kind, key: resolvedTxInLabel(item), txId: text(item?.tx_id), outputIndex: text(item?.index), resolved: item?.resolved === true, source: text(item?.source), reason: text(item?.reason), addressHex: text(txOut.address_hex), coinLovelace: text(txOut.coin_lovelace), assets };
};

const resolvedTxInRows = (items, pathRoot) =>
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
      witnessPlanPath(pathRoot, `#${index}`, "key"),
      key,
      detailParts.join(" / ")
    );
  });

const validationResolvedTxInRows = (items, pathRoot) =>
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
      validationPath(pathRoot, `#${index}`, "key"),
      key,
      detailParts.join(" / ")
    );
  });

const normalizeWitnessPlan = (plan) => {
  if (!plan || typeof plan !== "object") {
    return invalidWitnessPlan(
      "Witness plan",
      "Ledger operation response missing witness_plan."
    );
  }

  const summary = plan.summary && typeof plan.summary === "object" ? plan.summary : {};
  const requiredSigners = Array.isArray(plan.required_signers)
    ? plan.required_signers
    : [];
  const vkeyWitnesses = Array.isArray(plan.present_vkey_witnesses)
    ? plan.present_vkey_witnesses
    : [];
  const bootstrapWitnesses = Array.isArray(plan.present_bootstrap_witnesses)
    ? plan.present_bootstrap_witnesses
    : [];
  const missingWitnesses = Array.isArray(plan.missing_vkey_witnesses)
    ? plan.missing_vkey_witnesses
    : [];
  const scripts = Array.isArray(plan.scripts) ? plan.scripts : [];
  const redeemers = Array.isArray(plan.redeemers) ? plan.redeemers : [];
  const datums = Array.isArray(plan.datums) ? plan.datums : [];
  const referenceInputs = Array.isArray(plan.reference_inputs)
    ? plan.reference_inputs
    : [];
  const resolvedInputs = Array.isArray(plan.resolved_inputs)
    ? plan.resolved_inputs
    : [];
  const resolvedReferenceInputs = Array.isArray(plan.resolved_reference_inputs)
    ? plan.resolved_reference_inputs
    : [];
  const context = plan.context && typeof plan.context === "object" ? plan.context : {};
  const warnings = Array.isArray(plan.warnings) ? plan.warnings.map(text) : [];

  const missingCount = Number(summary.missing_vkey_witness_count ?? missingWitnesses.length);
  const subtitle =
    missingCount > 0
      ? `${missingCount} missing declared signer${missingCount === 1 ? "" : "s"}`
      : `${vkeyWitnesses.length + bootstrapWitnesses.length} present key witness${
          vkeyWitnesses.length + bootstrapWitnesses.length === 1 ? "" : "es"
        }`;

  return {
    valid: true,
    title: "Witness plan",
    subtitle,
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
      metric("Reference inputs", summary.reference_input_count ?? referenceInputs.length),
      metric("Producer txs", context.producer_tx_count ?? 0),
      metric("Resolved inputs", context.resolved_input_count ?? 0),
      metric("Missing inputs", context.missing_input_count ?? 0),
    ],
    warnings,
    resolvedInputs: [
      ...resolvedInputs.map((item) => resolvedInput(item, "Regular input")),
      ...resolvedReferenceInputs.map((item) => resolvedInput(item, "Reference input")),
    ],
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
            item?.reason,
            keyIdentifierCandidates(item?.hash)
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
          const exUnits =
            item?.ex_units && typeof item.ex_units === "object" ? item.ex_units : {};
          const detail = `mem ${text(exUnits.memory ?? 0)} / steps ${text(
            exUnits.steps ?? 0
          )}`;
          return witnessRow(
            item?.purpose || `#${index}`,
            item?.redeemer_data_hash,
            witnessPlanPath("redeemers", `#${index}`, "redeemer_data_hash"),
            item?.redeemer_data_hash,
            detail
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
            item?.computed_hash ? `computed ${shortHex(item.computed_hash)}` : sourceDetail(item)
          )
        ),
      },
      {
        title: "Reference inputs",
        empty: "None referenced.",
        rows: referenceInputs.map((item, index) =>
          witnessRow(
            `#${index}`,
            `${shortHex(item?.tx_id)}#${text(item?.index)}`,
            witnessPlanPath("reference_inputs", `#${index}`, "tx_id"),
            item?.tx_id,
            `index ${text(item?.index)}`
          )
        ),
      },
    ],
  };
};

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

const metric = (label, value) => ({ label, value: text(value) });

const yesNo = (value) => (value === true ? "yes" : value === false ? "no" : "n/a");

const jsonCopy = (value) => {
  try {
    return JSON.stringify(value);
  } catch (_err) {
    return text(value);
  }
};

const validationStatusSubtitle = (status, failures, missingContext, errors) => {
  switch (status) {
    case "valid":
      return "accepted for supplied context";
    case "invalid":
      return plural(failures.length, "ledger failure");
    case "incomplete":
      return plural(missingContext.length, "missing context item");
    case "rejected":
      return plural(errors.length, "context error");
    default:
      return "validation response";
  }
};

const readableContextKind = (kind, count) => {
  const label = text(kind || "context").replace(/_/g, " ");
  if (count === 1) return label;
  if (label === "source output") return `source outputs (${count})`;
  return `${label} (${count})`;
};

const missingContextSummary = (items) => {
  const counts = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const kind = item?.kind || "context";
    counts.set(kind, (counts.get(kind) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([kind, count]) => readableContextKind(kind, count))
    .join(", ");
};

const validationCheckRows = (checks, missingContext) =>
  (Array.isArray(checks) ? checks : []).map((item, index) => {
    const title = item?.title || item?.id || `#${index}`;
    const status = item?.status || "";
    const scope = item?.scope ? `scope ${text(item.scope)}` : "";
    const missing = missingContextSummary(missingContext);
    const message =
      item?.id === "ledger.apply_tx" && status === "not_evaluated" && missing !== ""
        ? `Missing ${missing}.`
        : item?.message
          ? text(item.message)
          : "";
    const detail = [scope, message].filter((part) => part !== "").join(" / ");
    return witnessRow(
      title,
      status,
      validationPath("checks", `#${index}`),
      item?.id || jsonCopy(item),
      detail
    );
  });

const validationMissingContextRows = (items) =>
  (Array.isArray(items) ? items : []).map((item, index) => {
    const key =
      item?.tx_id && item?.index !== undefined
        ? `${item.tx_id}#${text(item.index)}`
        : item?.tx_id || item?.kind || `#${index}`;
    return witnessRow(
      item?.kind || `#${index}`,
      key,
      validationPath("missing_context", `#${index}`),
      item?.tx_id || key || jsonCopy(item),
      item?.message || ""
    );
  });

const validationFailureRows = (items) =>
  (Array.isArray(items) ? items : []).map((item, index) =>
    witnessRow(
      item?.rule || item?.code || item?.kind || `#${index}`,
      item?.predicate || item?.message || item?.code || "",
      validationPath("failures", `#${index}`),
      item?.predicate || jsonCopy(item),
      item?.message || ""
    )
  );

const validationErrorRows = (items) =>
  (Array.isArray(items) ? items : []).map((item, index) =>
    witnessRow(
      item?.kind || item?.code || `#${index}`,
      item?.message || jsonCopy(item),
      validationPath("errors", `#${index}`),
      jsonCopy(item),
      item?.path ? `path ${JSON.stringify(item.path)}` : ""
    )
  );

const validationResolutionRows = (resolution) => {
  if (!resolution || typeof resolution !== "object") return [];
  const rows = [];
  if (resolution.provider) {
    rows.push(
      witnessRow(
        "provider",
        resolution.provider,
        validationPath("context", "resolution", "provider"),
        resolution.provider,
        resolution.source ? `source ${resolution.source}` : ""
      )
    );
  }
  if (resolution.validation_context_source) {
    rows.push(
      witnessRow(
        "validation context",
        resolution.validation_context_source,
        validationPath("context", "resolution", "validation_context_source"),
        resolution.validation_context_source,
        "slot, epoch, network, protocol parameters"
      )
    );
  }
  const errors = Array.isArray(resolution.errors) ? resolution.errors : [];
  errors.forEach((error, index) =>
    rows.push(
      witnessRow(
        "provider error",
        error,
        validationPath("context", "resolution", "errors", `#${index}`),
        error,
        "provider resolution"
      )
    )
  );
  return rows;
};

const normalizeValidation = (validation) => {
  if (!validation || typeof validation !== "object") {
    return invalidValidation(
      "Ledger validation",
      "Ledger operation response missing validation."
    );
  }

  const status = text(validation.status || "unknown");
  const checks = Array.isArray(validation.checks) ? validation.checks : [];
  const failures = Array.isArray(validation.failures) ? validation.failures : [];
  const missingContext = Array.isArray(validation.missing_context)
    ? validation.missing_context
    : [];
  const resolvedInputs = Array.isArray(validation.resolved_inputs)
    ? validation.resolved_inputs
    : [];
  const resolvedReferenceInputs = Array.isArray(validation.resolved_reference_inputs)
    ? validation.resolved_reference_inputs
    : [];
  const errors = Array.isArray(validation.errors) ? validation.errors : [];
  const warnings = Array.isArray(validation.warnings) ? validation.warnings.map(text) : [];
  const context =
    validation.context && typeof validation.context === "object" ? validation.context : {};
  const resolution =
    context.resolution && typeof context.resolution === "object" ? context.resolution : {};
  const contextErrors = Array.isArray(resolution.errors) ? resolution.errors.map(text) : [];
  const complete = validation.complete === true;
  const validForSuppliedContext = validation.valid_for_supplied_context === true;

  return {
    valid: ["valid", "invalid", "incomplete", "rejected"].includes(status),
    title: "Ledger validation",
    subtitle: validationStatusSubtitle(status, failures, missingContext, errors),
    status,
    complete,
    validForSuppliedContext,
    contextErrors,
    metrics: [
      metric("Status", status),
      metric("Network", context.network ?? "n/a"),
      metric("Slot", context.slot ?? "n/a"),
      metric("Epoch", context.epoch ?? "n/a"),
      metric("Complete", yesNo(complete)),
      metric("Valid for context", yesNo(validForSuppliedContext)),
      metric("Checks", checks.length),
      metric("Failures", failures.length),
      metric("Missing context", missingContext.length),
      metric("Context errors", errors.length),
      metric("Resolved inputs", context.resolved_input_count ?? resolvedInputs.length),
      metric(
        "Resolved ref inputs",
        context.resolved_reference_input_count ?? resolvedReferenceInputs.length
      ),
    ],
    warnings,
    sections: [
      {
        title: "Checks",
        empty: "No validation checks reported.",
        rows: validationCheckRows(checks, missingContext),
      },
      {
        title: "Provider resolution",
        empty: "No provider resolution metadata supplied.",
        rows: validationResolutionRows(resolution),
      },
      {
        title: "Missing context",
        empty: "No missing context reported.",
        rows: validationMissingContextRows(missingContext),
      },
      {
        title: "Ledger failures",
        empty: "No ledger failures reported.",
        rows: validationFailureRows(failures),
      },
      {
        title: "Context errors",
        empty: "No context errors reported.",
        rows: validationErrorRows(errors),
      },
      {
        title: "Resolved inputs",
        empty: "No input UTxO context supplied.",
        rows: validationResolvedTxInRows(resolvedInputs, "resolved_inputs"),
      },
      {
        title: "Resolved reference inputs",
        empty: "No reference input UTxO context supplied.",
        rows: validationResolvedTxInRows(
          resolvedReferenceInputs,
          "resolved_reference_inputs"
        ),
      },
    ],
  };
};

const executionUnits = (units) => {
  if (!units || typeof units !== "object") return "";
  const memory = text(units.memory);
  const steps = text(units.steps);
  if (memory === "" && steps === "") return "";
  return `${memory || "?"} memory / ${steps || "?"} steps`;
};

const contextDetail = (item) =>
  text(item?.message) || text(item?.kind) || (item ? jsonCopy(item) : "");

const normalizeScriptRedeemer = (redeemer) => {
  const failure =
    redeemer?.failure && typeof redeemer.failure === "object" ? redeemer.failure : {};
  const missingContext = Array.isArray(redeemer?.missing_context)
    ? redeemer.missing_context.map(contextDetail).filter((detail) => detail !== "")
    : [];
  return {
    purpose: text(redeemer?.purpose),
    index: text(redeemer?.index),
    status: text(redeemer?.status),
    declaredExUnits: executionUnits(redeemer?.declared_ex_units),
    evaluatedExUnits: executionUnits(redeemer?.evaluated_ex_units),
    failureCode: text(failure.code),
    failureMessage: text(failure.message),
    missingContext,
  };
};

const scriptEvaluationSubtitle = (status, redeemers, missingContext) => {
  switch (status) {
    case "succeeded":
      return plural(redeemers.length, "redeemer evaluated");
    case "failed":
      return plural(redeemers.length, "redeemer reported a failure");
    case "incomplete":
      return plural(missingContext.length, "missing context item");
    case "rejected":
      return "evaluator rejected the supplied context";
    case "not_applicable":
      return "No scripts apply to this transaction.";
    default:
      return "script evaluation response";
  }
};

const normalizeScriptEvaluation = (evaluation) => {
  if (!evaluation || typeof evaluation !== "object") {
    return invalidScriptEvaluation(
      "Script evaluation",
      "Ledger script evaluation response was not JSON."
    );
  }

  const redeemers = Array.isArray(evaluation.redeemers)
    ? evaluation.redeemers.map(normalizeScriptRedeemer)
    : [];
  const missingContext = Array.isArray(evaluation.missing_context)
    ? evaluation.missing_context.map(contextDetail).filter((detail) => detail !== "")
    : [];
  const status = text(evaluation.status || "unknown");
  const valid = ["succeeded", "failed", "incomplete", "rejected", "not_applicable"].includes(status);
  return {
    valid,
    title: "Script evaluation",
    subtitle: valid
      ? scriptEvaluationSubtitle(status, redeemers, missingContext)
      : "Ledger script evaluation response had an unsupported status.",
    status,
    redeemers,
    missingContext,
  };
};

export const inspectImpl = (raw) => {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (_err) {
    return emptyInspection("Raw output", "The decoder did not return JSON.");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return emptyInspection("Raw output", "The decoder returned a non-object JSON value.");
  }

  const outputs = Array.isArray(parsed.outputs) ? parsed.outputs : [];
  const inputs = Array.isArray(parsed.inputs) ? parsed.inputs : [];
  const referenceInputs = Array.isArray(parsed.reference_inputs)
    ? parsed.reference_inputs
    : [];
  const mint = parsed.mint && typeof parsed.mint === "object" ? parsed.mint : {};
  const validity =
    parsed.validity_interval && typeof parsed.validity_interval === "object"
      ? parsed.validity_interval
      : {};

  const totalOutputAssets = outputs.reduce(
    (total, output) => total + assetCount(output && output.assets),
    0
  );
  const mintedAssets = assetCount(mint);

  const outputRows = outputs.slice(0, 8).map((output, index) => ({
    index: `#${index}`,
    address: shortHex(output && output.address_hex, 18, 10),
    coin: formatLovelace(output && output.coin_lovelace),
    assets: assetLabel(output && output.assets),
    datum: datumLabel(output && output.datum),
  }));

  const mintRows = policyEntries(mint)
    .slice(0, 8)
    .map(([policy, assets]) => ({
      policy: shortHex(policy, 14, 10),
      assets: assetLabel({ [policy]: assets }),
    }));

  const inputRows = inputs.slice(0, 8).map(txInLabel);
  const referenceInputRows = referenceInputs.slice(0, 8).map(txInLabel);

  return {
    valid: true,
    title: `${text(parsed.era || "Decoded")} transaction`,
    subtitle: text(parsed.decoder || ""),
    metrics: [
      metric("Fee", formatLovelace(parsed.fee_lovelace)),
      metric("Inputs", parsed.input_count ?? inputs.length),
      metric("Reference inputs", parsed.reference_input_count ?? referenceInputs.length),
      metric("Outputs", parsed.output_count ?? outputs.length),
      metric("Output assets", totalOutputAssets),
      metric("Mint policies", policyCount(mint)),
      metric("Minted assets", mintedAssets),
      metric("Certificates", parsed.cert_count ?? 0),
      metric("Withdrawals", parsed.withdrawal_count ?? 0),
      metric("Required signers", parsed.required_signer_count ?? 0),
      metric("Valid from", validityLabel(validity.invalid_before)),
      metric("Valid until", validityLabel(validity.invalid_hereafter)),
    ],
    outputs: outputRows,
    mint: mintRows,
    inputs: inputRows,
    referenceInputs: referenceInputRows,
    outputNote:
      outputs.length > outputRows.length
        ? `Showing first ${outputRows.length} of ${outputs.length} outputs.`
        : "",
    mintNote:
      policyCount(mint) > mintRows.length
        ? `Showing first ${mintRows.length} of ${policyCount(mint)} mint policies.`
        : "",
    inputNote:
      inputs.length + referenceInputs.length > inputRows.length + referenceInputRows.length
        ? "Input previews are truncated."
        : "",
  };
};

const pathRoot = "[]";

const invalidBrowser = (title, subtitle, currentJson = "") => ({
  valid: false,
  title,
  subtitle,
  currentPath: pathRoot,
  currentJson,
  breadcrumbs: [{ label: "tx", path: pathRoot }],
  rows: [],
});

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

const invalidRdfGraph = () => ({
  valid: false,
  format: "",
  turtle: "",
});

const normalizeRdfGraph = (rdf) => {
  if (!rdf || typeof rdf !== "object") {
    return invalidRdfGraph();
  }

  const format = text(rdf.format);
  const turtle = text(rdf.turtle);
  return {
    valid: format !== "" && turtle !== "",
    format,
    turtle,
  };
};

export const operationInspectionImpl = (raw) => {
  try {
    const parsed = JSON.parse(raw);
    const result = operationResult(parsed);
    if (result && Object.prototype.hasOwnProperty.call(result, "inspection")) {
      return JSON.stringify(result.inspection);
    }
  } catch (_err) {
    return raw;
  }
  return raw;
};

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

export const operationRdfGraphImpl = (raw) => {
  try {
    const parsed = JSON.parse(raw);
    return normalizeRdfGraph(operationResult(parsed)?.rdf);
  } catch (_err) {
    return invalidRdfGraph();
  }
};

export const operationValidationImpl = (raw) => {
  try {
    const parsed = JSON.parse(raw);
    return normalizeValidation(operationResult(parsed)?.validation);
  } catch (_err) {
    return invalidValidation("Ledger validation", "Ledger operation response was not JSON.");
  }
};

export const operationScriptEvaluationImpl = (raw) => {
  try {
    const parsed = JSON.parse(raw);
    return normalizeScriptEvaluation(operationResult(parsed)?.script_evaluation);
  } catch (_err) {
    return invalidScriptEvaluation(
      "Script evaluation",
      "Ledger script evaluation response was not JSON."
    );
  }
};

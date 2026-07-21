const text = (value) => (value === null || value === undefined ? "" : String(value));

const invalidAttachment = () => ({
  valid: false,
  status: "rejected",
  signedTxCborHex: "",
  witnessPatchAction: "",
  errors: [],
  warnings: [],
});

export const operationWitnessAttachmentImpl = (raw) => {
  try {
    const root = JSON.parse(raw);
    const result = root?.result ?? root;
    const attachment = result?.witness_attachment;
    if (!attachment || typeof attachment !== "object" || Array.isArray(attachment)) {
      return invalidAttachment();
    }

    const signedTxCborHex = text(attachment.signed_tx_cbor_hex);
    return {
      valid: true,
      status: text(attachment.status) || "rejected",
      signedTxCborHex: signedTxCborHex || text(attachment.tx_cbor),
      witnessPatchAction: text(attachment.witness_patch_action),
      errors: (Array.isArray(attachment.errors) ? attachment.errors : []).map((issue) => ({
        code: text(issue?.code),
        message: text(issue?.message),
        path: (Array.isArray(issue?.path) ? issue.path : []).map(text),
      })),
      warnings: (Array.isArray(attachment.warnings) ? attachment.warnings : []).map(text),
    };
  } catch (_error) {
    return invalidAttachment();
  }
};

export const decodeCurrentSlotImpl = (raw) => {
  try {
    const slot = JSON.parse(raw)?.slot;
    if (typeof slot !== "string" || !/^(0|[1-9][0-9]*)$/.test(slot)) {
      return { valid: false, slot: 0, error: "Provider validation context did not contain a decimal slot." };
    }
    const parsed = Number(slot);
    if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > 0x7fffffff) {
      return { valid: false, slot: 0, error: "Provider validation-context slot is outside the supported range." };
    }
    return { valid: true, slot: parsed, error: "" };
  } catch (_error) {
    return { valid: false, slot: 0, error: "Provider validation context was not JSON." };
  }
};

const invalidWitnessPlan = (error) => ({
  valid: false,
  requiredSigners: [],
  missingVkeyWitnesses: [],
  presentVkeyWitnesses: [],
  error,
});

const witnessPlanHashes = (plan, field) => {
  const values = plan?.[field];
  if (!Array.isArray(values)) {
    throw new Error(`Ledger witness plan omitted ${field}.`);
  }
  return values.map((value) => {
    const hash = typeof value === "string" ? value : value?.hash;
    if (typeof hash !== "string" || hash.trim() === "") {
      throw new Error(`Ledger witness plan contained an invalid ${field} entry.`);
    }
    return hash.trim();
  });
};

export const engineWitnessPlanImpl = (raw) => {
  try {
    const root = JSON.parse(raw);
    const plan = (root?.result ?? root)?.witness_plan;
    if (!plan || typeof plan !== "object" || Array.isArray(plan)) {
      return invalidWitnessPlan("Ledger witness plan response was malformed.");
    }
    return {
      valid: true,
      requiredSigners: witnessPlanHashes(plan, "required_signers"),
      missingVkeyWitnesses: witnessPlanHashes(plan, "missing_vkey_witnesses"),
      presentVkeyWitnesses: witnessPlanHashes(plan, "present_vkey_witnesses"),
      error: "",
    };
  } catch (error) {
    return invalidWitnessPlan(error instanceof Error ? error.message : String(error));
  }
};

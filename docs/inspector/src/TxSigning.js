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

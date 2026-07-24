export const renderTransactionReview = (envelope) => JSON.stringify({
  ledger_functional_layer: envelope.ledger_functional_layer,
  op: envelope.op,
  result: { review: envelope.result.review },
  ...(Object.hasOwn(envelope, "resolutions") ? { resolutions: envelope.resolutions } : {}),
}, null, 2);

const operationResult = (parsed) => parsed?.result ?? parsed;

const inputKey = (input) => `${input.tx_id}#${input.index}`;

const isTxIn = (input) =>
  input &&
  typeof input === "object" &&
  /^[0-9a-fA-F]{64}$/.test(String(input.tx_id || "")) &&
  Number.isInteger(Number(input.index));

const uniqueTxIns = (inputs) => {
  const seen = new Set();
  const txIns = [];
  for (const input of inputs.filter(isTxIn)) {
    const txIn = {
      tx_id: String(input.tx_id).toLowerCase(),
      index: Number(input.index),
    };
    const key = inputKey(txIn);
    if (seen.has(key)) continue;
    seen.add(key);
    txIns.push({ ...txIn, key });
  }
  return txIns;
};

const extractInspectionInputs = (inspectionResponse) => {
  const parsed = JSON.parse(inspectionResponse);
  const inspection = operationResult(parsed)?.inspection ?? operationResult(parsed);
  const inputs = Array.isArray(inspection?.inputs) ? inspection.inputs : [];
  const referenceInputs = Array.isArray(inspection?.reference_inputs)
    ? inspection.reference_inputs
    : [];
  return {
    inputs: uniqueTxIns(inputs),
    referenceInputs: uniqueTxIns(referenceInputs),
  };
};

const errorMessage = (err) => (err instanceof Error ? err.message : String(err));

const providerValidationContext = async (fetchValidationContext, errors) => {
  try {
    const raw = await fetchValidationContext();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      errors.push("validation_context: provider returned a non-object response");
      return { fields: {}, source: "" };
    }
    const { source, ...fields } = parsed;
    return { fields, source: typeof source === "string" ? source : "" };
  } catch (err) {
    errors.push(`validation_context: ${errorMessage(err)}`);
    return { fields: {}, source: "" };
  }
};

export const resolveProducerTxContextImpl =
  (provider) => (source) => (inspectionResponse) => (fetchTxCbor) => (fetchValidationContext) => (fetchProducerTxs) => async () => {
    const { inputs, referenceInputs } = extractInspectionInputs(inspectionResponse);
    const requestedTxIds = [
      ...new Set([...inputs, ...referenceInputs].map((input) => input.tx_id)),
    ];
    const producerTxs = {};
    const missing = [];
    const errors = [];
    const validationContext = await providerValidationContext(fetchValidationContext, errors);

    if (!fetchProducerTxs && requestedTxIds.length > 0) {
      missing.push(...requestedTxIds);
      errors.push("producer_txs: provider credentials not supplied");
    } else {
      for (const txId of requestedTxIds) {
        try {
          const cbor = await fetchTxCbor(txId)();
          producerTxs[txId] = {
            tx_cbor: cbor,
            source,
          };
        } catch (err) {
          missing.push(txId);
          errors.push(`${txId}: ${errorMessage(err)}`);
        }
      }
    }

    return JSON.stringify({
      input_policy: "preserve",
      context: {
        ...validationContext.fields,
        producer_txs: producerTxs,
        resolution: {
          provider,
          source: "tx-cbor",
          validation_context_source: validationContext.source,
          requested_input_count: inputs.length,
          requested_reference_input_count: referenceInputs.length,
          requested_tx_count: requestedTxIds.length,
          resolved_count: Object.keys(producerTxs).length,
          missing,
          errors,
          unspent_status: "not_checked",
        },
      },
    });
  };

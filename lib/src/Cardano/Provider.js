const headersObject = (headers) => Object.fromEntries(headers.map(({ name, value }) => [name, value]));
const cborHexBytes = (hex) => {
  if (typeof hex !== "string" || hex.length === 0 || hex.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(hex)) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  return bytes;
};
const bodyValue = (requestValue) => {
  const body = requestValue.body?.value0;
  if (body === undefined) return undefined;
  if (body.encoding === "text") return body.value;
  if (body.encoding === "cbor-hex") {
    const bytes = cborHexBytes(body.value);
    if (bytes === null) throw new Error("invalid cbor-hex request body");
    return bytes;
  }
  throw new Error("unknown request body encoding");
};
const read = async (requestValue) => {
  const body = bodyValue(requestValue);
  const response = await fetch(requestValue.url, { method: requestValue.method, headers: headersObject(requestValue.headers), ...(body === undefined ? {} : { body }) });
  return { status: response.status, body: await response.text() };
};
const operationResult = (parsed) => parsed?.result ?? parsed;
const inputKey = (input) => `${input.tx_id}#${input.index}`;
const isTxIn = (input) => input && typeof input === "object" && /^[0-9a-fA-F]{64}$/.test(String(input.tx_id || "")) && Number.isInteger(Number(input.index));
const uniqueTxIns = (inputs) => { const seen = new Set(); return inputs.filter(isTxIn).reduce((all, input) => { const txIn = { tx_id: String(input.tx_id).toLowerCase(), index: Number(input.index) }; if (!seen.has(inputKey(txIn))) { seen.add(inputKey(txIn)); all.push(txIn); } return all; }, []); };
const providerDiagnostic = (error, txId) => {
  const raw = error instanceof Error ? error.message : String(error);
  const match = /^\[(PROVIDER_(?:AUTHENTICATION|RATE_LIMIT|SERVER|TRANSPORT|DECODE))\]\s*(.*)$/.exec(raw);
  return { ...(txId === undefined ? {} : { tx_id: txId }), code: match?.[1] ?? "PROVIDER_TRANSPORT", message: match?.[2] ?? raw };
};

export const fetchHttpResponse = (requestValue) => async () => read(requestValue);
export const isValidCborHex = (hex) => cborHexBytes(hex) !== null;
export const cborHexBodyByteValues = (body) => {
  const value = bodyValue({ body: { value0: body } });
  return value instanceof Uint8Array ? Array.from(value) : [];
};
export const decodeTxCbor = (body) => { try { const parsed = JSON.parse(body); const entry = Array.isArray(parsed) ? parsed[0] : parsed; return typeof entry?.cbor === "string" ? { ok: true, value: entry.cbor, error: "" } : { ok: false, value: "", error: "response missing 'cbor' field" }; } catch (error) { return { ok: false, value: "", error: error.message }; } };
export const decodeSubmissionReceipt = (body) => { try { const txId = JSON.parse(body); return typeof txId === "string" && /^[0-9a-fA-F]{64}$/.test(txId) ? { ok: true, txId: txId.toLowerCase(), error: "" } : { ok: false, txId: "", error: "response must be a 64-character hexadecimal transaction id" }; } catch (error) { return { ok: false, txId: "", error: error instanceof Error ? error.message : String(error) }; } };
export const decodeValidationContext = (provider) => (network) => (firstBody) => (secondBody) => {
  try {
    const first = JSON.parse(firstBody); const second = JSON.parse(secondBody); const ledgerNetwork = network === "mainnet" ? "mainnet" : "testnet";
    if (provider === "Blockfrost") {
      if (!first || !second || typeof first !== "object" || typeof second !== "object") throw new Error("response missing object payload");
      return { ok: true, network: ledgerNetwork, slot: String(first.slot ?? first.abs_slot), epoch: String(first.epoch), protocolParameters: JSON.stringify(blockfrostParams(second)), source: "blockfrost.blocks.latest+epochs.latest.parameters", error: "" };
    }
    const tip = Array.isArray(first) ? first[0] : first; const params = Array.isArray(second) ? second[0] : second;
    if (!tip || !params || typeof tip !== "object" || typeof params !== "object") throw new Error("response missing object payload");
    return { ok: true, network: ledgerNetwork, slot: String(tip.abs_slot), epoch: String(tip.epoch_no), protocolParameters: JSON.stringify(params), source: "koios.tip+cli_protocol_params", error: "" };
  } catch (error) { return { ok: false, network: "", slot: "", epoch: "", protocolParameters: "", source: "", error: error instanceof Error ? error.message : String(error) }; }
};
const number = (value) => typeof value === "string" ? Number(value) : value;
const blockfrostParams = (params) => params?.txFeePerByte !== undefined && params?.protocolVersion !== undefined ? params : { txFeePerByte: number(params.min_fee_a), txFeeFixed: number(params.min_fee_b), maxBlockBodySize: number(params.max_block_size), maxTxSize: number(params.max_tx_size), maxBlockHeaderSize: number(params.max_block_header_size), stakeAddressDeposit: number(params.key_deposit), stakePoolDeposit: number(params.pool_deposit), poolRetireMaxEpoch: number(params.e_max), stakePoolTargetNum: number(params.n_opt), poolPledgeInfluence: number(params.a0), monetaryExpansion: number(params.rho), treasuryCut: number(params.tau), protocolVersion: { major: number(params.protocol_major_ver), minor: number(params.protocol_minor_ver) }, minPoolCost: number(params.min_pool_cost), utxoCostPerByte: number(params.coins_per_utxo_size ?? params.coins_per_utxo_word), costModels: params.cost_models_raw ?? params.cost_models, executionUnitPrices: { priceMemory: number(params.price_mem), priceSteps: number(params.price_step) }, maxTxExecutionUnits: { memory: number(params.max_tx_ex_mem), steps: number(params.max_tx_ex_steps) }, maxBlockExecutionUnits: { memory: number(params.max_block_ex_mem), steps: number(params.max_block_ex_steps) }, maxValueSize: number(params.max_val_size), collateralPercentage: number(params.collateral_percent), maxCollateralInputs: number(params.max_collateral_inputs), poolVotingThresholds: { motionNoConfidence: number(params.pvt_motion_no_confidence), committeeNormal: number(params.pvt_committee_normal), committeeNoConfidence: number(params.pvt_committee_no_confidence), hardForkInitiation: number(params.pvt_hard_fork_initiation), ppSecurityGroup: number(params.pvt_p_p_security_group ?? params.pvtpp_security_group) }, dRepVotingThresholds: { motionNoConfidence: number(params.dvt_motion_no_confidence), committeeNormal: number(params.dvt_committee_normal), committeeNoConfidence: number(params.dvt_committee_no_confidence), updateToConstitution: number(params.dvt_update_to_constitution), hardForkInitiation: number(params.dvt_hard_fork_initiation), ppNetworkGroup: number(params.dvt_p_p_network_group), ppEconomicGroup: number(params.dvt_p_p_economic_group), ppTechnicalGroup: number(params.dvt_p_p_technical_group), ppGovGroup: number(params.dvt_p_p_gov_group), treasuryWithdrawal: number(params.dvt_treasury_withdrawal) }, committeeMinSize: number(params.committee_min_size), committeeMaxTermLength: number(params.committee_max_term_length), govActionLifetime: number(params.gov_action_lifetime), govActionDeposit: number(params.gov_action_deposit), dRepDeposit: number(params.drep_deposit), dRepActivity: number(params.drep_activity), minFeeRefScriptCostPerByte: number(params.min_fee_ref_script_cost_per_byte) };
export const encodeValidationContext = (context) => JSON.stringify({ network: context.network, slot: context.slot, epoch: context.epoch, protocol_parameters: JSON.parse(context.protocolParameters), source: context.source });
export const resolveProducerTxContextImpl = (provider) => (source) => (inspectionResponse) => (fetchTxCbor) => (fetchValidationContext) => (canFetchValidationContext) => (fetchProducerTxs) => async () => { const parsed = JSON.parse(inspectionResponse); const inspection = operationResult(parsed)?.inspection ?? operationResult(parsed); const inputs = uniqueTxIns(Array.isArray(inspection?.inputs) ? inspection.inputs : []); const referenceInputs = uniqueTxIns(Array.isArray(inspection?.reference_inputs) ? inspection.reference_inputs : []); const requestedTxIds = [...new Set([...inputs, ...referenceInputs].map((input) => input.tx_id))]; const producer_txs = {}; const missing = []; const errors = []; const error_codes = []; let validation = { fields: {}, source: "" }; if (provider === "blockfrost" && !canFetchValidationContext) { errors.push("validation_context: Blockfrost credentials not supplied"); error_codes.push({ code: "PROVIDER_AUTHENTICATION", message: "Blockfrost credentials not supplied" }); } else { try { const parsedContext = JSON.parse(await fetchValidationContext()); const { source: validationSource, ...fields } = parsedContext; validation = { fields, source: typeof validationSource === "string" ? validationSource : "" }; } catch (error) { const diagnostic = providerDiagnostic(error); errors.push(`validation_context: ${diagnostic.message}`); error_codes.push(diagnostic); } } if (!fetchProducerTxs && requestedTxIds.length > 0) { missing.push(...requestedTxIds); errors.push("producer_txs: provider credentials not supplied"); error_codes.push({ code: "PROVIDER_AUTHENTICATION", message: "producer transaction credentials not supplied" }); } else { for (const txId of requestedTxIds) { try { producer_txs[txId] = { tx_cbor: await fetchTxCbor(txId)(), source }; } catch (error) { const diagnostic = providerDiagnostic(error, txId); missing.push(txId); errors.push(`${txId}: ${diagnostic.message}`); error_codes.push(diagnostic); } } } return JSON.stringify({ input_policy: "preserve", context: { ...validation.fields, producer_txs, resolution: { provider, source: "tx-cbor", validation_context_source: validation.source, requested_input_count: inputs.length, requested_reference_input_count: referenceInputs.length, requested_tx_count: requestedTxIds.length, resolved_count: Object.keys(producer_txs).length, missing, errors, error_codes, unspent_status: "not_checked" } } }); };

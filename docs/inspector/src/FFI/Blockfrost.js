// Blockfrost CBOR fetch. Returns a Promise<string> of the hex, or throws.
// Project ID goes in the header (not URL) to avoid leaking via Referer/logs.

const BASES = {
  mainnet: "https://cardano-mainnet.blockfrost.io/api/v0",
  preprod: "https://cardano-preprod.blockfrost.io/api/v0",
  preview: "https://cardano-preview.blockfrost.io/api/v0",
};

const blockfrostHeaders = (projectId) => ({ project_id: projectId });

const ledgerNetwork = (network) => (network === "mainnet" ? "mainnet" : "testnet");

const readJson = async (resp, label) => {
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`Blockfrost ${label} ${resp.status}: ${body.slice(0, 200)}`);
  }
  return resp.json();
};

const value = (obj, ...keys) => {
  for (const key of keys) {
    if (obj && obj[key] !== undefined && obj[key] !== null) return obj[key];
  }
  return undefined;
};

const numberValue = (x) => (typeof x === "string" ? Number(x) : x);

const blockfrostParamsToLedgerPParams = (params) => {
  if (params?.txFeePerByte !== undefined && params?.protocolVersion !== undefined) {
    return params;
  }

  return {
    txFeePerByte: numberValue(params.min_fee_a),
    txFeeFixed: numberValue(params.min_fee_b),
    maxBlockBodySize: numberValue(params.max_block_size),
    maxTxSize: numberValue(params.max_tx_size),
    maxBlockHeaderSize: numberValue(params.max_block_header_size),
    stakeAddressDeposit: numberValue(params.key_deposit),
    stakePoolDeposit: numberValue(params.pool_deposit),
    poolRetireMaxEpoch: numberValue(params.e_max),
    stakePoolTargetNum: numberValue(params.n_opt),
    poolPledgeInfluence: numberValue(params.a0),
    monetaryExpansion: numberValue(params.rho),
    treasuryCut: numberValue(params.tau),
    protocolVersion: {
      major: numberValue(params.protocol_major_ver),
      minor: numberValue(params.protocol_minor_ver),
    },
    minPoolCost: numberValue(params.min_pool_cost),
    utxoCostPerByte: numberValue(value(params, "coins_per_utxo_size", "coins_per_utxo_word")),
    costModels: value(params, "cost_models_raw", "cost_models"),
    executionUnitPrices: {
      priceMemory: numberValue(params.price_mem),
      priceSteps: numberValue(params.price_step),
    },
    maxTxExecutionUnits: {
      memory: numberValue(params.max_tx_ex_mem),
      steps: numberValue(params.max_tx_ex_steps),
    },
    maxBlockExecutionUnits: {
      memory: numberValue(params.max_block_ex_mem),
      steps: numberValue(params.max_block_ex_steps),
    },
    maxValueSize: numberValue(params.max_val_size),
    collateralPercentage: numberValue(params.collateral_percent),
    maxCollateralInputs: numberValue(params.max_collateral_inputs),
    poolVotingThresholds: {
      motionNoConfidence: numberValue(params.pvt_motion_no_confidence),
      committeeNormal: numberValue(params.pvt_committee_normal),
      committeeNoConfidence: numberValue(params.pvt_committee_no_confidence),
      hardForkInitiation: numberValue(params.pvt_hard_fork_initiation),
      ppSecurityGroup: numberValue(value(params, "pvt_p_p_security_group", "pvtpp_security_group")),
    },
    dRepVotingThresholds: {
      motionNoConfidence: numberValue(params.dvt_motion_no_confidence),
      committeeNormal: numberValue(params.dvt_committee_normal),
      committeeNoConfidence: numberValue(params.dvt_committee_no_confidence),
      updateToConstitution: numberValue(params.dvt_update_to_constitution),
      hardForkInitiation: numberValue(params.dvt_hard_fork_initiation),
      ppNetworkGroup: numberValue(params.dvt_p_p_network_group),
      ppEconomicGroup: numberValue(params.dvt_p_p_economic_group),
      ppTechnicalGroup: numberValue(params.dvt_p_p_technical_group),
      ppGovGroup: numberValue(params.dvt_p_p_gov_group),
      treasuryWithdrawal: numberValue(params.dvt_treasury_withdrawal),
    },
    committeeMinSize: numberValue(params.committee_min_size),
    committeeMaxTermLength: numberValue(params.committee_max_term_length),
    govActionLifetime: numberValue(params.gov_action_lifetime),
    govActionDeposit: numberValue(params.gov_action_deposit),
    dRepDeposit: numberValue(params.drep_deposit),
    dRepActivity: numberValue(params.drep_activity),
    minFeeRefScriptCostPerByte: numberValue(params.min_fee_ref_script_cost_per_byte),
  };
};

export const fetchTxCborImpl = (network) => (projectId) => (txHash) => async () => {
  const base = BASES[network] || BASES.mainnet;
  const resp = await fetch(`${base}/txs/${txHash}/cbor`, {
    headers: blockfrostHeaders(projectId),
  });
  const json = await readJson(resp, "tx cbor");
  return json.cbor;
};

export const fetchValidationContextImpl = (network) => (projectId) => async () => {
  const base = BASES[network] || BASES.mainnet;
  const headers = blockfrostHeaders(projectId);
  const [block, params] = await Promise.all([
    fetch(`${base}/blocks/latest`, { headers }).then((resp) => readJson(resp, "latest block")),
    fetch(`${base}/epochs/latest/parameters`, { headers }).then((resp) =>
      readJson(resp, "latest protocol parameters")
    ),
  ]);

  return JSON.stringify({
    network: ledgerNetwork(network),
    slot: String(value(block, "slot", "abs_slot")),
    epoch: String(block.epoch),
    protocol_parameters: blockfrostParamsToLedgerPParams(params),
    source: "blockfrost.blocks.latest+epochs.latest.parameters",
  });
};

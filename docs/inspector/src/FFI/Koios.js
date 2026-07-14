// Koios CBOR fetch. Returns a Promise<string> of the hex, or throws.
//
// Koios is free and keyless for basic use (rate-limited). A bearer token
// can be supplied for higher limits; passed as empty string means no auth.
// Docs: https://api.koios.rest/

const BASES = {
  mainnet: "https://api.koios.rest/api/v1",
  preprod: "https://preprod.koios.rest/api/v1",
  preview: "https://preview.koios.rest/api/v1",
};

const koiosHeaders = (bearer) => {
  const headers = { "Content-Type": "application/json" };
  if (bearer && bearer.length > 0) {
    headers["Authorization"] = `Bearer ${bearer}`;
  }
  return headers;
};

const ledgerNetwork = (network) => (network === "mainnet" ? "mainnet" : "testnet");

const readJson = async (resp, label) => {
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`Koios ${label} ${resp.status}: ${body.slice(0, 200)}`);
  }
  return resp.json();
};

const firstObject = (json, label) => {
  const value = Array.isArray(json) ? json[0] : json;
  if (!value || typeof value !== "object") {
    throw new Error(`Koios: ${label} response missing object payload`);
  }
  return value;
};

export const fetchTxCborImpl = (network) => (bearer) => (txHash) => async () => {
  const base = BASES[network] || BASES.mainnet;
  const headers = koiosHeaders(bearer);
  const resp = await fetch(`${base}/tx_cbor`, {
    method: "POST",
    headers,
    body: JSON.stringify({ _tx_hashes: [txHash] }),
  });
  // Koios returns CORS headers on preflight but NOT on the actual POST
  // response, which browsers reject. The fetch above typically rejects as
  // TypeError("Failed to fetch") before we get here — the wrapping in
  // Main.purs surfaces that to the user. This .ok check only runs if the
  // browser accepted the response (e.g. running from a same-origin proxy).
  const arr = await readJson(resp, "tx cbor");
  if (!Array.isArray(arr) || arr.length === 0) {
    throw new Error("Koios: tx hash not found");
  }
  const entry = arr[0];
  if (!entry.cbor) {
    throw new Error(`Koios: response missing 'cbor' field: ${JSON.stringify(entry).slice(0, 200)}`);
  }
  return entry.cbor;
};

export const fetchValidationContextImpl = (network) => (bearer) => async () => {
  const base = BASES[network] || BASES.mainnet;
  const headers = koiosHeaders(bearer);
  const [tipResponse, pparamsResponse] = await Promise.all([
    fetch(`${base}/tip`, { headers }).then((resp) => readJson(resp, "tip")),
    fetch(`${base}/cli_protocol_params`, { headers }).then((resp) =>
      readJson(resp, "protocol parameters")
    ),
  ]);
  const tip = firstObject(tipResponse, "tip");
  const protocolParameters = firstObject(pparamsResponse, "protocol parameters");

  return JSON.stringify({
    network: ledgerNetwork(network),
    slot: String(tip.abs_slot),
    epoch: String(tip.epoch_no),
    protocol_parameters: protocolParameters,
    source: "koios.tip+cli_protocol_params",
  });
};

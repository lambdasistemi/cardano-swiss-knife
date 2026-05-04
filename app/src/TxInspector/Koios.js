const BASES = {
  mainnet: "https://api.koios.rest/api/v1",
  preprod: "https://preprod.koios.rest/api/v1",
  preview: "https://preview.koios.rest/api/v1",
};

const koiosHeaders = (bearer) => {
  const headers = { "Content-Type": "application/json" };
  if (bearer && bearer.length > 0) {
    headers.Authorization = `Bearer ${bearer}`;
  }
  return headers;
};

const readJson = async (resp, label) => {
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`Koios ${label} ${resp.status}: ${body.slice(0, 200)}`);
  }
  return resp.json();
};

export const fetchTxCborImpl = (network) => (bearer) => (txHash) => async () => {
  const trimmedHash = String(txHash || "").trim();
  if (trimmedHash === "") {
    throw new Error("Paste a transaction hash.");
  }

  const base = BASES[network] || BASES.mainnet;
  const resp = await fetch(`${base}/tx_cbor`, {
    method: "POST",
    headers: koiosHeaders(String(bearer || "").trim()),
    body: JSON.stringify({ _tx_hashes: [trimmedHash] }),
  });
  const rows = await readJson(resp, "tx cbor");
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("Koios: transaction hash not found.");
  }

  const first = rows[0];
  if (!first || typeof first.cbor !== "string") {
    throw new Error("Koios response missing CBOR payload.");
  }
  return first.cbor;
};

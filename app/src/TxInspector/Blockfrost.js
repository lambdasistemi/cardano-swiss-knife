const BASES = {
  mainnet: "https://cardano-mainnet.blockfrost.io/api/v0",
  preprod: "https://cardano-preprod.blockfrost.io/api/v0",
  preview: "https://cardano-preview.blockfrost.io/api/v0",
};

const readJson = async (resp, label) => {
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`Blockfrost ${label} ${resp.status}: ${body.slice(0, 200)}`);
  }
  return resp.json();
};

export const fetchTxCborImpl = (network) => (projectId) => (txHash) => async () => {
  const trimmedHash = String(txHash || "").trim();
  const trimmedKey = String(projectId || "").trim();

  if (trimmedHash === "") {
    throw new Error("Paste a transaction hash.");
  }
  if (trimmedKey === "") {
    throw new Error("Enter a Blockfrost project ID.");
  }

  const base = BASES[network] || BASES.mainnet;
  const resp = await fetch(`${base}/txs/${trimmedHash}/cbor`, {
    headers: { project_id: trimmedKey },
  });
  const json = await readJson(resp, "tx cbor");
  if (!json || typeof json.cbor !== "string") {
    throw new Error("Blockfrost response missing CBOR payload.");
  }
  return json.cbor;
};

// Thin wrapper over globalThis.runInspector (seeded by src/bootstrap.js).
// Returns a Promise<{ stdout, stderr, exitOk }>, mapped to Aff by the FFI.
export const runInspectorImpl = (stdinText) => () =>
  globalThis.runInspector(stdinText);

export const runLedgerOperationImpl = (txCbor) => (op) => (argsText) => () => {
  let args = {};
  try {
    const parsed = JSON.parse(argsText);
    if (Array.isArray(parsed)) {
      args = { path: parsed.map(String) };
    } else if (parsed && typeof parsed === "object") {
      args = parsed;
    }
  } catch (_err) {
    args = {};
  }

  return globalThis.runInspector(
    JSON.stringify({
      tx_cbor: txCbor,
      op,
      args,
    })
  );
};

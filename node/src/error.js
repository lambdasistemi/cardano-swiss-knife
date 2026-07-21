/**
 * Error used by internal adapters before public operations resolve it as a
 * `{ ok: false, error: { code, message } }` `CskResult`, rather than throw.
 * @param {import("./index.js").CskErrorCode} code Stable error taxonomy code.
 * @param {string} message Human-readable explanation.
 * @param {unknown} [cause] Optional underlying failure.
 * @example
 * const error = new CskError("DOMAIN_ERROR", "A network is required.");
 */
export class CskError extends Error {
  constructor(code, message, cause) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "CskError";
    this.code = code;
  }
}

export const toCskError = (error) => {
  if (error instanceof CskError) return error;
  const message = error instanceof Error ? error.message : String(error);
  const match = /^\[(ENGINE_(?:NOT_FOUND|INCOMPATIBLE|EXECUTION|PROTOCOL)|PROVIDER_(?:AUTHENTICATION|RATE_LIMIT|SERVER|TRANSPORT|DECODE))\]\s*(.*)$/.exec(message);
  return new CskError(match?.[1] || "DOMAIN_ERROR", match?.[2] || message, error);
};

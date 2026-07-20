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
  const match = /^\[(ENGINE_(?:NOT_FOUND|INCOMPATIBLE|EXECUTION|PROTOCOL))\]\s*(.*)$/.exec(message);
  return new CskError(match?.[1] || "DOMAIN_ERROR", match?.[2] || message, error);
};

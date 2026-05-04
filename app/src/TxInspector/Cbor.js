const bytesToHex = (bytes) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

export const encodeUtf8HexImpl = (value) =>
  bytesToHex(new TextEncoder().encode(value));

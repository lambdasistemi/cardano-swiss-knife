import { bech32 } from "bech32";

export const encode = (hrp) => (bytes) => bech32.encode(hrp, bech32.toWords(bytes), 1000);

export const decodeImpl = (onLeft) => (onRight) => (value) => {
  try {
    const decoded = bech32.decode(value, 1023);
    return onRight({
      hrp: decoded.prefix,
      bytes: Uint8Array.from(bech32.fromWords(decoded.words)),
    });
  } catch (error) {
    return onLeft(error instanceof Error ? error.message : String(error));
  }
};

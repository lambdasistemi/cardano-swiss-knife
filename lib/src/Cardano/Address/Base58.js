import { base58 } from "@scure/base";

export const encode = (bytes) => base58.encode(bytes);

export const decodeImpl = (onLeft) => (onRight) => (value) => {
  try {
    return onRight(base58.decode(value));
  } catch (error) {
    return onLeft(error instanceof Error ? error.message : String(error));
  }
};

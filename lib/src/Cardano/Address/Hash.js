import { blake2b } from "@noble/hashes/blake2b";

export const blake2b224 = (bytes) => Uint8Array.from(blake2b(bytes, { dkLen: 28 }));

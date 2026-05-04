const bytesToHex = (bytes) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

export const xpubPublicKeyBytesImpl = (xpubBytes) => xpubBytes.slice(0, 32);

export const vkeyWitnessCborHexImpl = (publicKeyBytes) => (signatureBytes) => {
  if (publicKeyBytes.length !== 32) {
    throw new Error("Expected a 32-byte Ed25519 public key.");
  }

  if (signatureBytes.length !== 64) {
    throw new Error("Expected a 64-byte Ed25519 signature.");
  }

  return bytesToHex(
    Uint8Array.from([
      0x82,
      0x58,
      0x20,
      ...publicKeyBytes,
      0x58,
      0x40,
      ...signatureBytes,
    ])
  );
};

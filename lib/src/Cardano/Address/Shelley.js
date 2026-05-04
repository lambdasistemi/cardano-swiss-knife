export const xpubPublicKeyBytesImpl = (xpubBytes) => xpubBytes.slice(0, 32);

export const enterpriseAddressBytesImpl = (networkTag) => (paymentCredential) =>
  Uint8Array.from([0x60 | networkTag, ...paymentCredential]);

export const delegationAddressBytesImpl =
  (networkTag) => (paymentCredential) => (stakeCredential) =>
    Uint8Array.from([networkTag, ...paymentCredential, ...stakeCredential]);

export const rewardAddressBytesImpl = (networkTag) => (stakeCredential) =>
  Uint8Array.from([0xe0 | networkTag, ...stakeCredential]);

import { signPayload, verifySignature } from "../index.js";
export const sign = ({ signingKey, payloadMode, payloadInput }) => signPayload({ signingKeyBech32: signingKey, payloadMode, payloadInput });
export const verify = ({ payloadMode, payloadInput, verificationKey, signature }) => verifySignature({ payloadMode, payloadInput, verificationKeyBech32: verificationKey, signatureHex: signature });

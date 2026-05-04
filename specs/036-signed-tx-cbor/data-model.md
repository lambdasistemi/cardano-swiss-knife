# Data Model: Patch Generated VKey Witnesses into Transaction CBOR

## Witness Material

- **bodyHashHex**: Hex-encoded transaction body hash used for signing
- **verificationKeyBech32**: Human-readable verification key corresponding to the signing key
- **signerHashHex**: Credential hash derived from the verification key and matched against witness-plan data
- **signatureHex**: Hex-encoded Ed25519 signature over the body hash
- **vkeyWitnessCborHex**: Hex-encoded CBOR of the generated vkey witness pair
- **signedTxCborHex**: Hex-encoded transaction CBOR after the witness set is patched
- **witnessPatchAction**: Enum-like status describing whether the patch inserted or replaced a vkey witness

## Transaction Witness Set

- Represented as a CBOR map keyed by witness class
- **Key `0`**: VKey witness collection
- Other witness classes must survive patching unchanged
- VKey witness entries are arrays of `[verification-key-bytes, signature-bytes]`

## Signed Transaction Artifact

- Top-level transaction CBOR preserved except for the vkey witness mutation
- Safe for reinspection through the existing transaction workflow
- Intended as a local artifact for copy, export, downstream validation, or later submission tooling

# Contract: Transaction Signing Result

The transaction-signing action returns either an error string or a witness-material payload.

## Success Payload

```json
{
  "bodyHashHex": "<hex>",
  "verificationKeyBech32": "<bech32>",
  "signerHashHex": "<hex>",
  "signatureHex": "<hex>",
  "vkeyWitnessCborHex": "<hex>",
  "signedTxCborHex": "<hex>",
  "witnessPatchAction": "inserted | replaced"
}
```

## Contract Notes

- `signedTxCborHex` is required once transaction patching is available.
- `witnessPatchAction` is informational and describes whether the signer was newly added or an existing vkey witness for the same verification key was replaced.
- Error results remain plain user-visible text and must not imply that a signed transaction artifact exists.

# Troubleshooting

<!-- release-docs:procedure:troubleshooting -->
Engine load and protocol failures surface as typed `ENGINE_*` or
`RDF_ENGINE_*` errors (see `node/src/error.js` / `CskErrorCode`). Common
codes:

| Code family | Meaning | Operator action |
| --- | --- | --- |
| `ENGINE_NOT_FOUND` / `RDF_ENGINE_NOT_FOUND` | Packaged WASM missing from the install path | Reinstall the npm or Nix package; do not copy a lone `.wasm` from another build |
| `ENGINE_INCOMPATIBLE` / `RDF_ENGINE_INCOMPATIBLE` | Artifact does not match the expected protocol | Align the package version with the engine pin in `release/engines.json` |
| `ENGINE_EXECUTION` / `ENGINE_PROTOCOL` | Engine ran but returned a hard failure | Fix the input CBOR/address; do not invent a host-side decode |
| `PROVIDER_*` | Provider transport/auth/decode failure | Check vault credentials, network, and rate limits |
| `DOMAIN_ERROR` | Shared PureScript domain rejected the input | Correct the domain input; message text is not stable for automation |

There is **no silent semantic fallback** when an engine is missing or
incompatible — fix the pin or packaging, do not reimplement address,
ledger, Plutus, or RDF semantics in the host. Prefer an explicit typed
error over a plausible-looking substitute result.

When automating, branch on the typed `code` field and keep `--output json`
enabled so failures stay machine-readable.
<!-- /release-docs:procedure:troubleshooting -->

## Getting more context

- Capability ↔ host mapping: [Capability reference](reference/capabilities.md)
- Engine pins and fail-hard text: [Engine reference](reference/engines.md)
- Host vs engine ownership: [System architecture](architecture/system.md)
- Release operator path: [Releasing](dev/releasing.md)

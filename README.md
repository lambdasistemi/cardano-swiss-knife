# cardano-swiss-knife

Browser-first Cardano Swiss Knife. Address inspection, mnemonic and derivation flows, payload signing, transaction inspection, and signed transaction witness attachment in one static web workbench.

- Live workbench: https://lambdasistemi.github.io/cardano-swiss-knife/
- Manual (the Docs tab): https://lambdasistemi.github.io/cardano-swiss-knife/manual
- Engine: https://github.com/lambdasistemi/cardano-ledger-inspector

The manual is the documentation — start there. Its Developer section covers
local setup, CI, and releasing.

[node/test/api-properties.test.mjs](node/test/api-properties.test.mjs) is the executable contract for all current
25 public Node exports. Transaction submission from issue #77 is not currently
exported; extend this property coverage when it lands.

Provider, browser-host, and engine responsibilities — including artifact pins,
explicit failure behavior, and the provider-extension procedure — are defined
in the [system architecture boundary](docs/architecture/system.md).

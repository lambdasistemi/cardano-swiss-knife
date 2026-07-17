# Book interchange contract

This document is the agreement surface between book producers and the
cardano-swiss-knife Library. Producers must target this contract instead of
depending on the Library implementation.

## Accepted inputs

The Library accepts four input forms:

1. Turtle overlay text through **Book Turtle**, **Book file**, or **Book URL**.
2. CIP-57 blueprint JSON through the same three paths.
3. An `amaru.book.bundle.v1` JSON object through **Book file** or **Book URL**.
4. A `cardano-ledger-inspector.books.v1` store document through
   **Book store JSON file**.

Every path is transactional. A successful import adds a selected local book
and reports its name and part count. A rejected input leaves the local store
unchanged and reports a visible reason. Empty input, an unsupported JSON kind,
an empty supported bundle, and a malformed recognized entry are errors; none
is a silent no-op.

## Overlay vocabulary

Canonical Turtle uses these prefixes:

```turtle
@prefix cardano: <https://lambdasistemi.github.io/cardano-ledger-rdf/vocab/cardano#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix overlay: <https://lambdasistemi.github.io/cardano-ledger-inspector/overlay/amaru-treasury#> .
```

This contract uses the existing `overlay:Owner`, `overlay:Address`, and
`overlay:CardanoScript` classes. It does not add or redesign overlay
vocabulary.

### Owner key hash

A 28-byte hexadecimal key hash is normalized to lowercase. Its subject IRI is
`urn:cardano:id:key:<key-hash>` and its label is the entry's `name`:

```turtle
<urn:cardano:id:key:8bd03209d227956aaf9670751e0aa2057b51c1537a43f155b24fb1c1>
  a overlay:Owner ;
  rdfs:label "network_compliance scope owner" .
```

### Bech32 address

A Bech32 Cardano address keeps its textual form. Its subject IRI is
`urn:cardano:id:address:<bech32-address>` and `cardano:bech32` carries the
resolution value:

```turtle
<urn:cardano:id:address:addr1qx9aqvsf6gne2640jec828s25gzhk5wp2day8u24kf8mrs2v0zyuvk80fay35dx008p45ts0u6cdrv9g2maetq8jm8psznjcrz>
  a overlay:Address ;
  rdfs:label "operator fuel wallet" ;
  cardano:bech32 "addr1qx9aqvsf6gne2640jec828s25gzhk5wp2day8u24kf8mrs2v0zyuvk80fay35dx008p45ts0u6cdrv9g2maetq8jm8psznjcrz" .
```

### Script hash

A 28-byte script hash is normalized to lowercase. Its subject IRI is
`urn:cardano:id:script:<script-hash>`, it has type `overlay:CardanoScript`,
and its `rdfs:label` is the emitting book's ordinary human-readable script
label. The bundled Amaru journal, for example, labels a treasury script with
the treasury title and its script role:

```turtle
<urn:cardano:id:script:5fbb3e5295c211c7595ddd23db2e0a0833131e0681cc7ea800f85d34>
  a overlay:CardanoScript ;
  rdfs:label "Amaru Core Development treasury script" .
```

## `amaru.book.bundle.v1`

The bundle is a JSON object with exactly this dispatch shape:

```json
{
  "kind": "amaru.book.bundle.v1",
  "books": {
    "wallets": [
      {
        "name": "network_compliance scope owner",
        "address": "8bd03209d227956aaf9670751e0aa2057b51c1537a43f155b24fb1c1"
      },
      {
        "name": "operator fuel wallet",
        "address": "addr1qx9aqvsf6gne2640jec828s25gzhk5wp2day8u24kf8mrs2v0zyuvk80fay35dx008p45ts0u6cdrv9g2maetq8jm8psznjcrz"
      }
    ]
  }
}
```

`books` is a map. These keys are recognized:

| Canonical key | Compatibility key | Entry shape | Imported form |
| --- | --- | --- | --- |
| `wallets` | `named:wallets` | `{ "name": string, "address": string }` | Resolution triples |
| `references` | `named:references` | `{ "name": string, "cid": string }` or `{ "name": string, "label": string, "uri": string, "type": string }` | Inert labeled part |
| `descriptions` | `free:descriptions` | string | Inert labeled part |
| `justifications` | `free:justifications` | string | Inert labeled part |
| `destination_labels` | `free:destination_labels` | string | Inert labeled part |
| `validity_hours` | `free:validity_hours` | string | Inert labeled part |
| `slippage_bps` | `free:slippage_bps` | string | Inert labeled part |
| `split_counts` | `free:split_counts` | string | Inert labeled part |

Unprefixed keys are canonical for newly produced bundle JSON. The prefixed
aliases remain accepted because the 2026-07-17 bundle used
`named:wallets`. If both aliases for one logical key occur, the import is
rejected as ambiguous.

Each recognized entry becomes one book part, in JSON map and array order. The
imported local book is named **Amaru book bundle**, has source
`amaru.book.bundle.v1`, is selected, and reports the total recognized part
count. Wallet parts contain the Turtle mapping below. Reference URI and
free-text parts are deliberately inert: their label/source value is retained
for interchange and part accounting, but they emit no RDF and therefore cannot
affect resolution. Unknown book keys are ignored only when at least one
supported entry imports; the success feedback names the ignored keys.

### Exact wallet mapping

For every `{name, address}` entry:

- `name` must be a non-empty string and becomes the `rdfs:label` literal.
- A 56-hex-character `address` is a 28-byte key hash and maps to
  `<urn:cardano:id:key:<lowercase-hash>> a overlay:Owner`.
- An `addr...`/`addr_test...` Bech32 `address` maps to
  `<urn:cardano:id:address:<address>> a overlay:Address` plus
  `cardano:bech32 "<address>"`.
- Any other `address` rejects the whole bundle with a visible entry-specific
  reason.

The example bundle above therefore produces exactly these resolution triples
(in addition to the declared prefixes):

```turtle
<urn:cardano:id:key:8bd03209d227956aaf9670751e0aa2057b51c1537a43f155b24fb1c1>
  a overlay:Owner ;
  rdfs:label "network_compliance scope owner" .

<urn:cardano:id:address:addr1qx9aqvsf6gne2640jec828s25gzhk5wp2day8u24kf8mrs2v0zyuvk80fay35dx008p45ts0u6cdrv9g2maetq8jm8psznjcrz>
  a overlay:Address ;
  rdfs:label "operator fuel wallet" ;
  cardano:bech32 "addr1qx9aqvsf6gne2640jec828s25gzhk5wp2day8u24kf8mrs2v0zyuvk80fay35dx008p45ts0u6cdrv9g2maetq8jm8psznjcrz" .
```

## Feedback contract

Success messages have the form `Imported <book name> (<n> parts).` Store JSON
may add more than one book and reports the imported book and part totals.
Failures name the path and reason, for example `Book import failed: bundle
wallets[1].address is neither a 28-byte key hash nor a Cardano Bech32
address.` The visible status is replaced by the next import attempt; it is not
used as hidden logging.

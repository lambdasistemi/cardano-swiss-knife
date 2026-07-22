# Book interchange contract

This document is the agreement surface between book producers and the
cardano-swiss-knife Library. Producers must target this contract instead of
depending on the Library implementation.

## Accepted inputs

The Library accepts three input forms:

1. Turtle overlay text through **Book Turtle**, **Book file**, or **Book URL**.
2. CIP-57 blueprint JSON through the same three paths.
3. A `cardano-ledger-inspector.books.v1` store document through
   **Book store JSON file**.

Every path is transactional. A successful import adds a selected local book
and reports its name and part count. A rejected input leaves the local store
unchanged and reports a visible reason. Empty input, an unsupported JSON kind,
and a malformed recognized entry are errors; none
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

## Feedback contract

Success messages have the form `Imported <book name> (<n> parts).` Store JSON
may add more than one book and reports the imported book and part totals.
Failures name the path and reason, for example `Book import failed: unsupported
JSON kind: amaru.book.bundle.v1.` The visible status is replaced by the next
import attempt; it is not used as hidden logging.

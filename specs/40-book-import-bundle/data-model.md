# Data model: Loud Amaru book bundle import

## Bundle document

- `kind`: exactly `amaru.book.bundle.v1`
- `books`: object whose recognized logical keys have at most one canonical or
  compatibility spelling
- unknown keys: retained only for visible ignored-key feedback

Validation rejects a missing/wrong kind, non-object books value, alias
collision, malformed recognized collection, malformed entry, or zero supported
entries.

## Bundle entry

- wallet: non-empty `name` plus either a 56-character hexadecimal key hash or a
  Cardano Bech32 `address`
- reference: non-empty `name` plus `cid`, or the current
  `name`/`label`/`uri`/`type` shape
- free text: string value under a recognized free-text key

Each accepted entry becomes exactly one ordered local part.

## Local part

- `id`: deterministic within the imported bundle
- `label`: entry name, label, or retained free-text value
- `kind`: `overlay` for wallets; inert reference/text kind otherwise
- `turtle`: contract-pinned Turtle for wallets, empty for inert parts
- `plutusJson`: retained non-RDF source representation or empty string

## Local book

- `name`: `Amaru book bundle`
- `source`: `amaru.book.bundle.v1`
- `raw`: original trimmed JSON
- `parts`: one per recognized entry
- `turtle`: wallet-part Turtle joined in entry order
- `selected`: true
- `seed`: false

## Import feedback

Exactly one of these states is visible after an attempt:

- success: imported name plus part count, or imported book/part totals for a
  store document; optional ignored-key detail
- failure: path-specific or entry-specific reason
- none: initial state or deliberate user editing before an attempt

Success and failure replace one another. Failed parsing or persistence does not
transition the stored-book collection.

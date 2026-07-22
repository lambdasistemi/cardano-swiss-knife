# Tasks: Port book parsing to PureScript

## Slice 1 — Port and integrate book parsing

- [ ] T102-S1 Add RED PureScript characterization tests for the recognized-input ADT and exact retained-format outputs.
- [ ] T103-S1 Add or strengthen packaged Node characterization for ordered Turtle, CIP-57, Amaru journal, store JSON, and rejected bundle inputs.
- [ ] T104-S1 Implement typed JSON decoding and exhaustive retained-shape dispatch in `Book.purs`.
- [ ] T105-S1 Port the RDF/Turtle, label, identifier, hash, number, blueprint, and book-part helpers with byte-exact parity.
- [ ] T106-S1 Implement ordered store-document import and blueprint argument generation in PureScript.
- [ ] T107-S1 Reduce `Book.js` to the three build-time injected constants.
- [ ] T108-S1 Switch the inspector compatibility facade and Node bundle entry point to the compiled PureScript module.
- [ ] T109-S1 Run focused PureScript and Node verification plus `./gate.sh`, and commit the accepted slice with the required trailer.

## Finalization — orchestrator-owned

- [ ] T110-F1 Audit the delivered diff and PR body, verify fresh remote CI, stamp finalization, drop `gate.sh`, and mark the PR ready.

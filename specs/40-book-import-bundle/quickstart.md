# Quickstart: verify loud Amaru book bundle import

## Automated proof

1. Run `nix run .#ci-inspector-playwright` and confirm the bundle/feedback
   regression scenarios pass.
2. Run `./gate.sh` and confirm exit 0 after the browser suite, UX captures,
   combined-site smoke, docs build, and repository checks.

## Required browser scenarios

1. Open `/library` in a clean browser context.
2. Import `docs/inspector/tests/fixtures/attx-book-bundle.json` through
   **Book file**.
3. Confirm **Amaru book bundle** is visible, selected, and has two parts.
4. Confirm success reads `Imported Amaru book bundle (2 parts).` and persisted
   Turtle contains one `overlay:Owner`, one `overlay:Address`, both labels, and
   the address `cardano:bech32` value.
5. Import a malformed bundle. Confirm a visible reason and byte-for-byte
   unchanged local store.
6. Exercise Turtle paste, URL, a Turtle book file, and a valid store JSON file;
   confirm each success reports its imported name/part count or aggregate
   totals.

## Scope audit

Verify the diff contains no rendering changes, engine repository changes,
server calls, telemetry, export behavior, or new overlay vocabulary.

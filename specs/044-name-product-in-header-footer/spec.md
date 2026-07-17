# Product branding — issue #44

## P1 user story

As a visitor, I open the site and see its product name in the header, with
footer links to both the product repository and the ledger-engine repository.

## Functional requirements

- The header brand says `Cardano Swiss Knife` and retains a clear
  transaction-inspector subtitle.
- The footer retains the engine Docs link and exposes distinct Source and
  Engine links.
- Source targets `https://github.com/lambdasistemi/cardano-swiss-knife`.
- Engine targets `https://github.com/lambdasistemi/cardano-ledger-inspector`.
- Every Playwright assertion that pins the old header name is updated.

## Success criteria

- No site-shell occurrence of `Ledger Inspector` remains.
- The extended Nix gate, including the Playwright suite, passes.

## Non-goals

- No repository rename, visual redesign, or navigation change.

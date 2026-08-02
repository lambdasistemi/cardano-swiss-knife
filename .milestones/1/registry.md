# Contract registry — csk M1

contract:   canonical structured signer review (tx.review envelope)
parties:    cardano-ledger-inspector (produces, owns ALL ledger semantics),
            cardano-swiss-knife Node/CLI/WebUI (render only, may decorate with
            book labels, never re-derive meaning)
invariant:  one structured result; hosts add no fallback semantics; parity
            across inspector WASI/native/Extism AND csk Node/CLI/WebUI
enforced:   PARTIAL — inspector CI parity smokes (WASI/Extism byte parity,
            tx.review smoke) cover the engine side; cross-HOST parity gate is
            csk#123, NOT yet landed. Until #123 merges this is enforced: NONE
            on the host side. #123 is the commissioned check; do not close #74
            without it.

contract:   inspector engine pin in csk releases
parties:    cardano-ledger-inspector (publishes engines), cardano-swiss-knife
            (pins in flake.lock, release/engines.json, docs/reference/engines.md)
invariant:  all three references resolve to the same inspector revision
enforced:   YES — `just release-docs` wired into csk gate.sh (added in PR #124
            after drift was found by hand)

contract:   csk release versioning
parties:    release-please manifest, cabal/package versions, tags
invariant:  manifest version == package version at tag time
enforced:   YES — release-please CI (lambdasistemi standard pattern)

contract:   milestones ledger branch mechanics (meta)
parties:    every milestone owner on this host, llm-settings ledger-sweep.sh
invariant:  one sweep checkout per (repo, milestone); no cross-milestone clobber
enforced:   NONE — script keys by N only (/tmp/ms-N/sweep-checkout); csk M1
            hand-runs against /tmp/ms-csk-1. Fix = llm-settings ticket (D4).

# Tasks: Migrated Amaru Witness Attach

## Slice 1 — Accept and prove migrated address-xsk signing sources

- [X] T001 Add a RED end-to-end CLI regression that encrypts and migrates an `amaruTreasuryWitnessVault`, lists its `cardano-addresses-addr-xsk` entry, and attempts witness attachment with the migrated identity.
- [X] T002 Verify the successful attachment's transaction and witness TextEnvelopes and post-attach witness plan contain the required signer without changing transaction body identity.
- [X] T003 Prove a valid but unrelated migrated identity is rejected before transaction output and unrelated secret kinds and unsupported representations remain `SECRET_SOURCE`.
- [X] T004 Prove passphrase, address xsk, and secret sentinels do not appear in stdout, stderr, captured argv/environment, or temporary artifacts.
- [X] T005 Accept exactly `signing-key` and `cardano-addresses-addr-xsk` for vault-backed witness preparation while preserving every other secret consumer's strict kind policy.
- [X] T006 Run `nix run .#ci-node-api` and `./gate.sh`, obtain navigator GREEN approval, and commit one bisect-safe slice with the required `Tasks:` trailer.

## Finalization — Orchestrator-owned

- [ ] T007 Independently reproduce the focused test and full gate, audit the implementation diff and navigator approval, stamp T001–T006 into the slice commit, and push it.
- [ ] T008 Update the PR body with delivered behavior and evidence, pass the finalization audit, remove `gate.sh`, and stamp T007–T009 in the drop-gate commit.
- [ ] T009 Mark PR #115 ready and verify fresh remote CI is green before declaring the ticket complete.

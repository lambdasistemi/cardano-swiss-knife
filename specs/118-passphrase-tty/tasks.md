# Tasks: Reliable Interactive Vault Prompts

## Slice 1 — Complete-line prompt and restoration

- [X] T001 Add a RED PTY regression that starts from a controlled noncanonical
  state, types a multi-character vault-create passphrase and confirmation
  incrementally, and proves the command waits for each complete line.
- [X] T002 Add a RED PTY regression that starts from a controlled noncanonical
  state, types the vault passphrase and provider credential incrementally, and
  proves both complete values are consumed.
- [X] T003 Prove exact terminal-state restoration and no-echo behavior after
  success, mismatch, invalid input, Ctrl-C, and a post-prompt command failure
  from both canonical and deliberately noncanonical starting states.
- [X] T004 Replace chunk-based interactive input with one session-scoped,
  line-aware `/dev/tty` reader and unconditional prior-state restoration.
- [X] T005 Preserve and rerun inherited `--passphrase-fd` behavior and secret
  redaction checks.
- [X] T006 Run the focused PTY suite and the full ticket gate before committing.

## Slice 2 — Orchestrator finalization

- [X] T007 Independently review the accepted slice and rerun the full local
  gate.
- [X] T008 Manually drive the real interactive command with a multi-character
  passphrase and record full-value plus before/after `stty -a` evidence.
- [X] T009 Refresh the PR body, audit commits and task accounting, drop
  `gate.sh`, push, mark ready, and require fresh remote CI before completion.

# Tasks: Reliable Interactive Vault Prompts

## Slice 1 — Complete-line prompt and restoration

- [ ] T001 Add a RED PTY regression that starts from a controlled noncanonical
  state, types a multi-character vault-create passphrase and confirmation
  incrementally, and proves the command waits for each complete line.
- [ ] T002 Add a RED PTY regression that starts from a controlled noncanonical
  state, types the vault passphrase and provider credential incrementally, and
  proves both complete values are consumed.
- [ ] T003 Prove exact terminal-state restoration and no-echo behavior after
  success, mismatch, invalid input, Ctrl-C, and a post-prompt command failure
  from both canonical and deliberately noncanonical starting states.
- [ ] T004 Replace chunk-based interactive input with one session-scoped,
  line-aware `/dev/tty` reader and unconditional prior-state restoration.
- [ ] T005 Preserve and rerun inherited `--passphrase-fd` behavior and secret
  redaction checks.
- [ ] T006 Run the focused PTY suite and the full ticket gate before committing.

## Slice 2 — Orchestrator finalization

- [ ] T007 Independently review the accepted slice and rerun the full local
  gate.
- [ ] T008 Manually drive the real interactive command with a multi-character
  passphrase and record full-value plus before/after `stty -a` evidence.
- [ ] T009 Refresh the PR body, audit commits and task accounting, drop
  `gate.sh`, push, mark ready, and require fresh remote CI before completion.

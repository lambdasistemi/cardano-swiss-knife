# Feature Specification: Reliable Interactive Vault Prompts

**Issue**: [#118](https://github.com/lambdasistemi/cardano-swiss-knife/issues/118)
**Priority**: P1

## User story

As a CSK operator, I can type a complete multi-character vault passphrase or
provider credential at an interactive prompt and have the command consume the
whole line without echoing it or leaving my terminal in a modified state.

## Acceptance scenarios

### US1 — Create a vault interactively

Given a normal controlling terminal, when an operator runs
`csk vault create --out PATH` and types a multi-character passphrase and
confirmation at human typing speed, then each complete line is consumed once,
the vault is created with that passphrase, no secret is echoed, and the exact
prior terminal state is restored.

### US2 — Add a provider credential interactively

Given an existing vault, when an operator runs `csk vault credential add ...`
without `--passphrase-fd`, then the complete vault passphrase and complete
provider-credential lines are read from `/dev/tty`, the credential is stored,
no secret is echoed, and the exact prior terminal state is restored.

### US3 — Fail without damaging the terminal

Given any interactive vault prompt, when confirmation mismatches, input is
empty or invalid, the command fails after input, or the operator sends Ctrl-C,
then the command fails closed, creates no unintended output, leaks no secret,
and restores the exact terminal state captured before prompting.

Given a controlling terminal that is initially noncanonical, when an operator
enters a multi-character secret, then the prompt temporarily establishes
canonical no-echo line input, consumes the complete line, and restores that
exact noncanonical pre-prompt state afterward.

### US4 — Preserve automation

Given an inherited `--passphrase-fd`, when automation supplies newline-delimited
values, then the existing descriptor parsing, CRLF stripping, validation,
redaction, and exit behavior remain unchanged.

## Functional requirements

- **FR-001**: Interactive secret input MUST be read as complete
  newline-terminated lines from `/dev/tty`; a stream chunk or single byte MUST
  NOT be treated as a complete line.
- **FR-002**: Interactive passphrase and provider-credential input MUST remain
  no-echo.
- **FR-003**: The prompt session MUST capture the terminal state, establish
  canonical no-echo input while prompting, and restore the exact captured state
  after success and every failure or signal path.
- **FR-004**: A single prompt session MUST support consecutive prompts without
  dropping, merging, or splitting lines.
- **FR-005**: Secret material MUST remain absent from command arguments,
  environment variables, stdout/stderr, transcripts, and cleartext temporary
  files.
- **FR-006**: `--passphrase-fd` and `--input-passphrase-fd` behavior MUST remain
  unchanged.
- **FR-007**: PTY-backed tests MUST type multi-character secrets incrementally,
  rather than sending a whole line in one write, and MUST compare `stty -g`
  before and after the command in both normal canonical and controlled
  noncanonical starting modes.

## Success criteria

- **SC-001**: Slow, character-by-character PTY input creates a vault that can be
  reopened with the full passphrase.
- **SC-002**: Slow, character-by-character PTY input adds a provider credential
  whose complete value is usable through the existing vault flow.
- **SC-003**: PTY state is byte-for-byte equal before and after success,
  mismatch, invalid input, Ctrl-C, and command/process failure cases, including
  a deliberately noncanonical pre-prompt state.
- **SC-004**: Existing inherited-descriptor tests remain green.
- **SC-005**: The full local gate, a manual real-PTY exercise, and fresh remote
  CI all pass.

## Non-goals

- Changing vault encryption or payload formats.
- Adding argv or environment-variable secret sources.
- Replacing inherited file descriptors for automation.
- Adding new vault or provider behavior beyond prompt reliability.

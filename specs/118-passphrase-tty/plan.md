# Implementation Plan: Reliable Interactive Vault Prompts

## Scope and diagnosis

The defect is confined to the shared terminal prompt primitive in
`cli/csk.mjs` and its PTY coverage in `test/vault-cli.test.mjs`.

The current helper launches a child Node process and treats the first
`process.stdin` `data` event as a complete secret, immediately destroying the
stream, but only disables echo on the controlling terminal. On a canonical
Linux TTY the kernel still delivers one cooked line per read, so paced typing
alone does not fail. When the prompt inherits a noncanonical TTY, however, the
first typed byte is a complete read and the helper advances immediately. That
controlled precondition explains and deterministically reproduces the reported
first-character symptom.

Existing Expect helpers start canonical and send an entire secret in one burst,
so they cannot expose the missing canonical-mode establishment. The regression
must add a noncanonical precondition while retaining the canonical cases.

## Technical approach

- Keep `/dev/tty` as the only interactive secret source and explicitly
  establish canonical, no-echo input for the lifetime of one prompt session.
- Replace the read-one-chunk subprocess with a persistent, line-aware reader
  over the controlling terminal. Consecutive `ask` calls consume exactly one
  complete CR/LF-terminated line each.
- Capture `stty -g` before changing terminal settings. Restore that exact state
  synchronously before closing the terminal resource, both from the normal
  `finally` path and from installed signal handlers.
- Treat setup/read/restore failures as closed prompt failures with the existing
  redacted diagnostics. Do not move secrets into argv, environment variables,
  or temporary files.
- Leave `fdText` and inherited-descriptor selection unchanged.

## Verification design

The regression PTY adds a deterministic noncanonical starting mode, then sends
each character separately with a short delay before the terminating carriage
return. Existing canonical cases remain in place. Together they prove:

1. `vault create` waits for and consumes both complete passphrase lines.
2. `vault credential add` waits for and consumes the complete vault
   passphrase and provider credential.
3. the prompt temporarily establishes canonical no-echo input even when the
   saved pre-prompt state is noncanonical.
4. secrets remain absent from terminal transcripts.
5. `stty -g` is identical before and after success, confirmation mismatch,
   empty/invalid input, Ctrl-C, and a post-prompt command failure, including
   restoration of the deliberately noncanonical saved state.
6. inherited passphrase descriptor tests remain unchanged and green.

The ticket orchestrator additionally runs a real interactive command in a
separate PTY, types a multi-character passphrase manually, verifies the output
with the full passphrase, and records before/after `stty -a` evidence in the
runtime status log.

## Slice 1 — Complete-line prompt and restoration

One bisect-safe RED→GREEN commit owns:

- `cli/csk.mjs`
- `test/vault-cli.test.mjs`
- `specs/118-passphrase-tty/tasks.md` only when the orchestrator amends reviewed
  task completion into the accepted commit

The driver first adds the slow-typing PTY regression and demonstrates it fails
against the current implementation. After navigator approval of RED, the driver
implements the minimal shared prompt fix, runs the focused vault CLI proof and
`./gate.sh`, obtains navigator approval of GREEN, and commits once.

## Slice 2 — Orchestrator finalization

The ticket orchestrator independently reviews the diff and reruns the gate,
manually exercises the actual interactive command with before/after terminal
evidence, refreshes the human-readable PR body, runs the commit/task audit,
drops `gate.sh`, pushes, marks the PR ready, and waits for fresh remote CI.

## Risks

- A line reader that is recreated per prompt can lose buffered follow-up input;
  use one session-scoped reader/queue.
- Restoring after the tty handle closes cannot work; restore before resource
  teardown.
- A canonical Linux TTY does not expose arbitrary pre-newline chunking; RED must
  control terminal mode rather than assert otherwise.
- Merely disabling echo assumes the caller already supplied canonical mode; the
  prompt must establish its own line-input precondition and then restore the
  caller's exact state.
- Test helpers that send the full string in one Expect `send` repeat the
  original blind spot; the regression must deliberately pace characters.

# Implementation Plan: Reliable Interactive Vault Prompts

## Scope and diagnosis

The defect is confined to the shared terminal prompt primitive in
`cli/csk.mjs` and its PTY coverage in `test/vault-cli.test.mjs`.

The current helper launches a child Node process and treats the first
`process.stdin` `data` event as a complete secret, immediately destroying the
stream. A `data` event is only a chunk boundary; it is not a line boundary.
Existing Expect helpers send an entire secret in one burst, so they accidentally
make one chunk look like one line and miss the human-typing regression.

## Technical approach

- Keep `/dev/tty` as the only interactive secret source and keep terminal echo
  disabled for the lifetime of one prompt session.
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

The regression PTY sends each character separately with a short delay before
the terminating carriage return. It proves:

1. `vault create` waits for and consumes both complete passphrase lines.
2. `vault credential add` waits for and consumes the complete vault
   passphrase and provider credential.
3. secrets remain absent from terminal transcripts.
4. `stty -g` is identical before and after success, confirmation mismatch,
   empty/invalid input, Ctrl-C, and a post-prompt command failure.
5. inherited passphrase descriptor tests remain unchanged and green.

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
- Generic stream chunks may split at arbitrary points; only CR/LF terminates a
  secret.
- Test helpers that send the full string in one Expect `send` repeat the
  original blind spot; the regression must deliberately pace characters.

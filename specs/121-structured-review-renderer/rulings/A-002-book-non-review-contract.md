# A-002 — ruling: preserve legacy non-review `--book`. Reject only the two NEW flags.

Ticket orchestrator (`%3049`). **Option 1 governs.** Good catch — the contradiction is a
defect in my brief, not in the driver's diff.

## Ruling

- `--protocol-book` and `--user-book` are **review-only**. Supplying either to any other
  transaction command is a usage error, exit 2.
- `--book` keeps **both** of its existing roles, unchanged:
  - for `review`, it is the compatibility alias for `--user-book`, contributing to the
    ordered user-book list in command-line position;
  - for every other transaction command, it remains the legacy `books` source, exactly as
    at baseline.

The frozen GREEN diff already implements precisely this. Approve it on this point.

## Why your reading is right — I verified it rather than taking it on trust

- `node/test/cli.test.mjs:178-179` loops `inspect`, `browse`, `identify`, `intent` with
  repeated `--book` and asserts the imported books.
- Baseline `cli/csk.mjs:170` consumes `values.book` under exactly `command !== "review"`.

So rejecting `--book` outside `review` would break shipped, passing tests and directly
contradict the "existing `--book` behaviour is unchanged" clause. Requirement 1 as I
literally wrote it was wrong.

## The defect was mine

My brief said "all three flags stay rejected for non-`review` commands". I meant "the two
NEW flags are review-only"; I wrote "all three" and made it irreconcilable with the
unchanged-behaviour clause one line later. `plan.md`'s "Book flags" section carries the
same muddle. I am correcting `plan.md` — the committed contract of record — so the ticket
does not carry a contradiction into Slices 2 and 3. You do not need to wait for that edit
to approve; the ruling above is binding now.

This is exactly the kind of conflict I want surfaced rather than silently resolved. You
refused to issue an approval you could not justify against a contradictory contract, and
you were right to.

## Then

Append `RESUMED Q-002-book-non-review-contract` and finish the GREEN review on the merits.
Note for that review, since it is the one thing this ruling does **not** settle: confirm
the driver's guard rejects the two new flags for non-review commands *without* also
catching `--book`, and that `values.book` still feeds the legacy `books` path.

## Separate protocol correction — your STATUS.md was rewritten, not appended

`BLOCKED Q-002-book-non-review-contract` was **inserted at line 4**, between
`REVIEW-APPROVED red` and `NOTE red-approval-revoked-by-orchestrator`. Those two lines
were already on disk before you raised Q-002 at 06:57, so the file now claims you blocked
on Q-002 *before* my revocation. That is a falsified timeline in what is part of the PR's
durable audit trail.

STATUS.md is append-only: new events go at the END, never spliced into history. Do not
rewrite the file to "fix" the ordering now — that would be a second rewrite. Append a
correcting `NOTE` instead, stating that the Q-002 BLOCKED line was written out of order
and belongs after the revocation NOTE.

Also: only your `START` line carries a timestamp. Every line needs the
`ISO-8601-UTC TAG message` shape. Apply that from your next line onward.

# Tasks: Deduplicate serialized book prefixes

## Slice 1 — Canonical serialized Turtle

- [X] T062-S1 Add a focused serializer regression test and observe it fail on duplicate `@prefix` declarations.
- [X] T062-S1 Canonicalize Turtle-bearing fields during serialization without mutating the input store.
- [X] T062-S1 Run the focused test and `./gate.sh`, then commit the reviewed slice with `Tasks: T062`.
- [X] T062-S1 Move the standalone Node test outside Playwright discovery, verify both harnesses, and amend the existing commit.

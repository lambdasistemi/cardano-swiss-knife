# Feature Specification: Deduplicate serialized book prefixes

**Issue**: #62
**Priority**: P1 bug fix

## User story

As an operator exporting a local annotation book after repeated "Label this
node" edits, I want each repeated Turtle `@prefix` declaration emitted once so
the exported book remains clean and stable.

## Requirements

- FR-001: Serializing a book store removes repeated, equivalent `@prefix`
  declaration lines from every Turtle-bearing book field (`raw`, `turtle`, and
  each part's `turtle`).
- FR-002: The first occurrence is retained and all non-prefix content remains
  in its original order.
- FR-003: Distinct declarations, including conflicting declarations that reuse
  a prefix name for a different IRI, are preserved rather than silently
  resolved.
- FR-004: Serialization does not mutate the input store.
- FR-005: The implementation is host-neutral and does not depend on browser or
  Node globals.
- FR-006: `docs/inspector/src/Main.purs` and the existing labeling Playwright
  suite remain untouched.

## Success criteria

- SC-001: A store containing repeated annotation-generated prefix blocks
  serializes with exactly one copy of each repeated declaration in all
  Turtle-bearing fields.
- SC-002: A focused standalone test proves RED before the fix and GREEN after
  it.
- SC-003: The repository `./gate.sh` passes at the accepted commit.

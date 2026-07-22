# Tasks: Safe Amaru book import

## Slice 1 — Guard dispatch and inject the source journal

- [X] T100-S1 Add RED regression coverage for arbitrary non-Amaru JSON and vendored journal injection.
- [X] T101-S1 Restrict Amaru fallback dispatch to the required journal shape and reject unknown JSON explicitly.
- [X] T102-S1 Replace the duplicated journal literal with browser and transplanted-test global injection from the vendored JSON.
- [X] T103-S1 Run focused tests and `./gate.sh`, record evidence, and commit with the required trailer.

## Finalization — orchestrator-owned

- [ ] T104-F1 Audit the PR body, verify fresh remote CI, mark ready, and drop `gate.sh` in the finalization commit.

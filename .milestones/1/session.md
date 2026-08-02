# tmux session `csk` — rebuild instructions

## Window csk:1 — ms1-mainnet-review (milestone owner desk, SINGLETON)
# Why: operator's desk for csk M1. One pane, no code, no pairs.
launch:  tmux new-window -t csk -n ms1-mainnet-review -c /code claude
resume:  type "/milestone-orchestrator" — bare load; registry entry in
         /code/llm-settings/shared/milestones.md points here; then follow
         .milestones/1/resume/ms.md on the milestones branch of
         lambdasistemi/cardano-swiss-knife.
runtime: /tmp/ms-csk-1 (STATUS.md is the journal)

## Window csk:2 — cardano-swiss-knife-e74-t121-cli-review (epic #74 quadrant; renames per active child)
# Why: epic #74 signer-review repair lane. Quadrant: epic owner top-left
# %2716 (claude, /code), ticket owner top-right %3049 (claude), pair bottom
# row %4380/%4381 (qwen node procs, /code/cardano-ledger-inspector-issue-168)
# — bottom three are parked post-#168; epic owner decides their reuse/teardown.
launch:  tmux new-window -t csk -n cardano-swiss-knife-e74-home -c /code claude
         (epic owner loads epic-orchestrator; model Claude, effort max)
resume:  paste pointer to /tmp/orch/briefs/csk-e74-signer-review.md AND its own
         fragment /code/cardano-swiss-knife/.orch/window-brief.md; runtime
         /tmp/epic-74 with EPIC-MAP.md + STATUS.md + review-repair/STATUS.md.
         The epic owner rebuilds its own ticket/pair subtree — do not build it
         for it.



## Window — cardano-swiss-knife-ms1-t129-release-pipeline (standalone ticket lane, desk-owned)
# Why: csk#129 publish-chain fix + drive 0.1.3 to a fully green publish. Ticket
# owner pane %4704 (claude, /code/cardano-swiss-knife); it builds its own
# worktree /code/cardano-swiss-knife-issue-129 and pair per resolve-ticket.
launch:  tmux new-window -t csk -n cardano-swiss-knife-ms1-t129-release-pipeline -c /code/cardano-swiss-knife 'claude --dangerously-skip-permissions'
resume:  paste "Read and execute /tmp/ms-csk-1/briefs/t129-release-pipeline.md; STATUS at /tmp/ms-csk-1/t129/STATUS.md"

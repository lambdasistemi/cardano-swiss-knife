# Resume brief — milestone owner, csk M1

You own lambdasistemi/cardano-swiss-knife milestone 1 across csk + 
cardano-ledger-inspector. Read ledger.md (state, priority, parked decisions)
and registry.md first; they are current as of the last sweep commit.

Immediate standing state: epic #74's chain is parked on ONE decision —
inspector PR #169 (green, verified) unmerged; csk#121/PR #125 waits on it;
#122/#123 operator-paused. Epic owner is alive in csk:1 pane %2716 and needs
only an authorization or next ask. Epic #66 needs an acceptance audit before
closing. Do not merge anything yourself; authorize, the epic owner executes.

Sweep discipline: hand-run git against /tmp/ms-csk-1/sweep-checkout (NOT the
skill script — N-collision with amaru ms1, see registry last entry). Fresh
root commit, force-push refs/heads/milestones.

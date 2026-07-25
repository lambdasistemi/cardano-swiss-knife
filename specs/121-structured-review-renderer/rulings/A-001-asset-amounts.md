# CORRECTED Decision — read this in full, it supersedes the earlier A-001

My earlier answer wrongly classified this as an internal architecture reinterpretation (like the
readiness-enum case in #120) and called `cardano-ledger-inspector#168` non-blocking on my own
authority. That was wrong: weakening #121's literal acceptance criterion ("exact lovelace/asset
amounts") to "exact lovelace + a count" is a product-scope change, not an implementation detail, and
I do not have standing to make that call unilaterally. The operator corrected this.

**Corrected ruling:**

1. `cardano-ledger-inspector#168` (https://github.com/lambdasistemi/cardano-ledger-inspector/issues/168,
   body already corrected) now **blocks final acceptance, ready-for-review, merge, and COMPLETE for
   #121** — unless the operator explicitly amends #121's acceptance criterion. It does not block
   ordinary bisect-safe slice progress.
2. You may continue with independently bisect-safe #121 slices that do **not** pretend
   `asset_class_count` is an asset amount — i.e. everything except the final regression-fixture slice
   that was going to assert "exact asset amounts" under the old default A.
3. Preserve a final upstream-integration slice for when #168 lands; do not build a fixture that
   labels a count as an amount, and do not weaken the test to make the current (incomplete) result
   pass.
4. **Do not implement #168 yourself or dispatch any work on it in this control turn** — the operator
   authorized #121 only. If #168 becomes the *only* remaining blocker to closing #121, write a fresh
   Q-file/escalation rather than starting upstream work on your own authority.
5. Update your own spec/plan/tasks to reflect #168 as a recorded blocking dependency before you freeze
   them, if you haven't already.

Everything else from the original default (exact lovelace, three uncollapsed categories, clear
count-not-amount labeling in what you *can* ship now) still stands as the correct interim shape for
the non-blocked slices — just understand the ticket cannot reach COMPLETE on that alone anymore.

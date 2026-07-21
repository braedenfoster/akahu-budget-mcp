# 07 — Planned Purchases + plan_period

**What to build:** The Household can keep a list of Planned Purchases and ask "what fits this month?" — a collective, priority-ordered evaluation of the whole wishlist against real remaining money. List-only, no reserving (ADR-0004 defers reserving). See `CONTEXT.md` (Planned Purchase, Plan period).

**Blocked by:** 05.

**Status:** shipped — implemented on `main` (commit 510dd72).

- [x] `planned_purchases` table: `{description, amount, target_category, target_period, priority, status}` with `status ∈ planned | purchased | dropped`.
- [x] `add_planned_purchase`, `list_planned_purchases`, `update_planned_purchase`, `mark_purchased`, `drop_planned_purchase` — all mutations audited/read-only-aware.
- [x] A Planned Purchase may name a future `target_period`; no automatic per-month saving is performed.
- [x] `plan_period(period)` reads the whole list, sorts by priority, and **greedily** tests each item against real remaining Envelope room + Household headroom, returning each as fits / fits-if-reallocated / doesn't-fit. It reserves nothing and mutates nothing.
- [x] Seam 1 tests: a wishlist that partially fits by priority order; ties; a future-Period item excluded from the current Period's fit — exact figures asserted.

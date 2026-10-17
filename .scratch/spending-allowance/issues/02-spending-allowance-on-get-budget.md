# 02: Spending allowance on get_budget

**What to build:** `get_budget` returns a `spending_allowance` block for the Period: the Household's Flexible money left, its parts, a per-week figure, an explicit status, the Uncategorized count, Data-as-of, and a stale flag. One engine function computes the block; `get_budget` only attaches it. All math is integer cents on the server (ADR-0003, ADR-0011).

**Blocked by:** 01 (Committed/Flexible flag on Budget Categories)

**Status:** ready-for-agent

Spec: `.scratch/spending-allowance/spec.md` (Formula, Time zone, Output shape)

- [ ] Amount = Flexible Envelopes' remaining (pooled, not clamped) − Committed overspend − Uncategorized spend; the three parts are returned too
- [ ] Committed underspend adds nothing; Committed overspend subtracts
- [ ] Uncategorized spend subtracts, and `uncategorized_count` counts the Uncategorized spend Transactions in the Period
- [ ] `TRANSFER` rows, Income, and Planned Purchases do not change the figure
- [ ] `status` is `no_budget` when the Period has no Budget, `over` when the amount is negative, else `ok`
- [ ] A `no_budget` read creates no Budget
- [ ] A new `household_timezone` setting (default `Pacific/Auckland`) sets local today; `days_left` includes today and is clamped to the Period length
- [ ] `per_week` is null unless `status` is `ok` and `days_left` > 0; it equals the amount when 7 or fewer days are left, else floor(amount × 7 ÷ days_left)
- [ ] `stale` is true when Data-as-of is missing or older than 36 hours
- [ ] Other tools keep their existing Period resolution
- [ ] Seam 1 tests cover each case listed in the spec's Testing Decisions, including clocks just before and after NZ local midnight

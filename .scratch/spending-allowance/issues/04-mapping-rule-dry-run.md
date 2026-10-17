# 04: Preview a Mapping Rule with dry_run

**What to build:** Before a new Mapping Rule rewrites history, a Member can see how many Transactions it would move and from which Budget Categories. This makes category splits (Insurance out of Household, Subscriptions out of Lifestyle) safe to apply.

**Blocked by:** None (can start immediately)

**Status:** shipped

Spec: `.scratch/spending-allowance/spec.md` (Tools)

- [x] `set_category_rule` accepts `dry_run` (default false)
- [x] With `dry_run`, it returns the count of Transactions it would move, grouped by source Budget Category
- [x] With `dry_run`, it writes nothing: no rule, no recategorization, no audit row
- [x] Without `dry_run`, behaviour is unchanged
- [x] Seam 1 tests cover the criteria above

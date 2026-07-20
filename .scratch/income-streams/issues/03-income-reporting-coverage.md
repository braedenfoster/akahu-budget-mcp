# 03 — Per-Stream income in reports + coverage check

**What to build:** Surface the per-Stream Income breakdown in the budget and period-summary reads (so the Household can watch a Stream — e.g. PPL — drop to zero), and a coverage check that flags connected Accounts receiving no Income. See ADR-0009 and `CONTEXT.md`.

**Blocked by:** 01.

**Status:** ready-for-agent

- [ ] `get_budget` and `get_period_summary` `income` blocks gain `by_stream: [{stream, actual_cents}]` (ordered, exact integer cents); existing `expected_cents` / `actual_cents` unchanged (`actual_cents` still = sum of `is_income` credits).
- [ ] `income_coverage` returns, per connected Account (and rolled up), the Income seen in the Period and flags Accounts with zero Income as possible missing-income sources; read-only with `data-as-of`.
- [ ] Seam 1 tests over seeded multi-stream fixtures: `by_stream` figures exact (incl. a period where a Stream is zero); `income_coverage` flags a zero-income Account; a Period with no budget still reports income by Stream.

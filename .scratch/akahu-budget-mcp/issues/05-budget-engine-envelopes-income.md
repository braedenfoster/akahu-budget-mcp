# 05 — Budget engine + Envelopes + income

**What to build:** The Household can create a monthly budget, allocate money to Envelopes, set expected income, and see the full current-Period picture — allocated/spent/remaining per Envelope, Slack, actual vs expected income, and Household headroom — all computed server-side. This is the heart of ADR-0003 and ADR-0004. See `CONTEXT.md` (Period, Budget, Envelope, Slack, headroom, Income, Reallocate).

**Blocked by:** 04.

**Status:** shipped — implemented on `main` (commit fb61ad4).

- [x] `budgets`/`envelopes` tables keyed on an explicit Period date range; `budget_month_start_day` setting (default 1) drives the range.
- [x] `create_budget_for_period` initializes a Period's Envelopes, optionally copying the previous Period's allocations.
- [x] `set_allocation` sets an Envelope's allocation; `set_expected_income` sets Household expected monthly income.
- [x] `get_budget` returns, for the Period: each Envelope's allocated/spent/remaining, per-Envelope Slack, actual income (sum of credit Transactions tagged income), expected income, Household headroom, totals, and `data-as-of`.
- [x] `reallocate` moves allocation between Envelopes as an explicit **audited** write (no real money moves — planning data only).
- [x] Spent is computed from categorized Transactions in the Period; all money math is integer-cent and server-owned (no floats, no LLM arithmetic).
- [x] Seam 1 tests assert exact allocated/spent/remaining/Slack/headroom/income values against seeded fixtures, including period-boundary cases.

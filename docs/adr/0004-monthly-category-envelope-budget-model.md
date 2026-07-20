# Budget model: monthly calendar-month category envelopes

A Budget is a set of **Envelopes** — per-Budget-Category dollar allocations — for a **calendar-month Period**. "Spent" is the sum of that Period's Transactions mapped to each Budget Category. This is the smallest model that answers both driving questions ("create a budget this month" = set allocations; "can we afford X" = check the relevant Envelope's remaining), and it leans on Akahu's existing categorization.

## Considered Options

- **Zero-based / YNAB (every dollar assigned, borrow-between-categories, rollover-everywhere)** — more powerful but far more state and rules than a two-person household needs.
- **Proportional 50/30/20** — too coarse to answer "can I afford this specific purchase in this category."

## Consequences

- Period is stored as an explicit date range with a `budget_month_start_day` setting (default 1), so pay-cycle periods become config, not a migration.
- Income is modeled lightweight and household-level (expected + actual credits); it is not per-Member.
- **Deferred to post-V1:** per-Envelope rollover, and full cashflow projection (starting balance + income − expenses → projected end-of-period balance) — cashflow is the primary post-V1 target, which is why we snapshot balances from day 1 (ADR-0005).

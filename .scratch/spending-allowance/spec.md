# Spec: Spending allowance

Status: ready-for-agent

_Builds on the shipped Akahu budgeting MCP. Vocabulary follows `CONTEXT.md` (Budget Category, Envelope, Period, Slack, Household headroom, Uncategorized, Data-as-of, Planned Purchase). The governing decisions are ADR-0011 (Spending allowance), ADR-0003 (the server owns all money math) and ADR-0004 (monthly category Envelope model). Read those first. The terms **Spending allowance**, **Committed** and **Flexible** are defined in `CONTEXT.md`._

## Problem Statement

The Household wants to see, at a glance on an Android home screen, how much money is left for flexible spending this Period. Today the budget only shows per-Envelope figures and Household totals. The totals mix flexible spending (groceries, cafés, clothes) with commitments (mortgage, insurance, savings, subscriptions). Unspent commitment money looks spendable, although the bill has not come out yet. There is no single honest number that answers "how much can we still spend on non-essentials", and there is no endpoint a phone widget can read.

## Solution

Add a **Spending allowance**: one Household figure for the current Period, computed on the server from Envelopes.

- Each Budget Category has a permanent flag: **committed** or **flexible**.
- Spending allowance = the sum of `remaining` over flexible Envelopes (overspends stay negative), minus the overspend on each committed Envelope, minus Uncategorized spend.
- Planned Purchases do not reduce it. They are a list, not reservations.
- A per-week figure shows how fast the Household can spend: allowance × 7 ÷ days left.
- The figure appears as a `spending_allowance` block on `get_budget`, so Claude quotes the same number as the widget.
- A read-only JSON route on the tailnet listener returns the same block for a phone widget (e.g. KWGT).

## User Stories

1. As a Member, I want one Spending allowance figure for the Household, so that both of us see the same number on our phones.
2. As a Member, I want the Spending allowance to show what is left in the current Period, so that I know how much flexible money remains this month.
3. As a Member, I want a per-week figure under the headline, so that a large number early in the month does not make me overspend.
4. As a Member, I want the per-week figure to equal the full allowance when 7 days or fewer are left, so that the last week does not show a meaningless pace.
5. As a Member, I want no per-week figure when the allowance is negative, so that the widget does not show a negative weekly budget.
6. As a Member, I want "today" and "days left" computed in NZ local time, so that the per-week figure is correct near midnight.
7. As a Member, I want each Budget Category flagged committed or flexible, so that the Spending allowance counts only flexible money.
8. As a Member, I want unspent money in a committed Envelope never to count as spendable, so that mortgage, insurance, and savings money is not shown as available.
9. As a Member, I want overspend on a committed Envelope to reduce the Spending allowance, so that a higher power bill comes out of flexible money.
10. As a Member, I want overspend on one flexible Envelope to reduce the pooled allowance, so that the figure shows money that is truly left.
11. As a Member, I want Uncategorized spend to reduce the Spending allowance, so that money that has left the account is never shown as available.
12. As a Member, I want the count of Uncategorized Transactions shown with the allowance, so that I know when to run a spending review.
13. As a Member, I want Planned Purchases not to reduce the allowance, so that a wishlist entry is not treated as a reservation.
14. As a Member, I want an explicit status (`ok`, `over`, `no_budget`), so that the widget never has to guess the state from the number.
15. As a Member, I want a "No budget for <month>" state when the Period has no Budget, so that I am prompted to create one instead of seeing an invented number.
16. As a Member, I want the allowance to carry Data-as-of, so that I know how fresh the figure is.
17. As a Member, I want the allowance flagged as stale when Data-as-of is older than 36 hours, so that a broken sync shows as a greyed-out number.
18. As a Member, I want `get_budget` to include the Spending allowance, so that Claude quotes exactly the number on my widget.
19. As a Member, I want the allowance to include its parts (flexible remaining, committed overspend, Uncategorized spend), so that Claude can explain why the number is what it is.
20. As a Member, I want a phone widget to read the allowance from a plain JSON route over the tailnet, so that the phone needs no OAuth.
21. As a Member, I want the JSON route to be unavailable on the public OAuth listener, so that bank figures never leave the tailnet without authentication.
22. As a Member, I want the JSON route to return exactly the same block as `get_budget`, so that there is one implementation of the money math.
23. As a Member, I want creating a Budget Category to require the flag, so that the agent must ask me which kind it is.
24. As a Member, I want to change a category's flag later, so that I can correct a wrong choice.
25. As a Member, I want `list_categories` to show each category's flag, so that I can review the split.
26. As a Member, I want existing categories marked committed after the migration, so that the allowance is too low rather than too high until we set the flags.
27. As a Member, I want a merged category to keep the target's flag, so that a merge never changes the allowance unexpectedly.
28. As a Member, I want to preview how many Transactions a new Mapping Rule would move before it writes, so that I can check a category split before applying it.
29. As a Member, I want new merchant rules to apply to past Transactions, so that reports and trends stay consistent after a split.
30. As a Member, I want an Insurance category split out of Household, so that insurance premiums are committed and hardware-store spend stays flexible.
31. As a Member, I want a Subscriptions category split out of Lifestyle and Professional Services, so that streaming and software subscriptions are committed.
32. As a Member, I want a committed Home projects category, so that a savings-funded purchase does not make the allowance hugely negative.
33. As a Member, I want the plan-purchase workflow to tell the agent to allocate a savings-funded purchase to Home projects before the payment goes out, so that the purchase sits inside its allocation.
34. As a Member, I want the create-budget workflow to show the committed/flexible split and the resulting allowance, so that I see the effect of my allocations when I set a budget.
35. As a Member, I want the flag to apply to all Periods, so that I do not maintain a per-Period flag history.

## Implementation Decisions

### Domain

- **Spending allowance** is a new derived figure. It is not stored. Keep it separate from Slack (per-Envelope) and Household headroom (income − allocated).
- The flag values are **committed** and **flexible**. "Committed" covers recurring payments, savings, debt repayment, and sinking funds. "Flexible" covers variable spending.
- The terms are in `CONTEXT.md`; the decision is ADR-0011 (it refines ADR-0004).

### Schema

- Add `kind` to `budget_categories`: text, `committed | flexible`, not null.
- The migration sets `kind = committed` on every existing row, including the Uncategorized system row.
- The engine ignores `kind` on the Uncategorized system category. Uncategorized has its own rule (below).

### Formula (integer cents, server-owned)

For a Period with a Budget:

1. `flexible_remaining` = sum of `allocated − spent` over flexible Envelopes. Do not clamp. A flexible category with spend but no allocation counts as allocated 0.
2. `committed_overspend` = sum of `max(0, spent − allocated)` over committed Envelopes.
3. `uncategorized_spent` = the Uncategorized Envelope's `spent` (non-income, non-`TRANSFER`, as `computeBudget` already defines spend).
4. `amount` = `flexible_remaining − committed_overspend − uncategorized_spent`.
5. `status` = `no_budget` if no Budget exists for the Period; else `over` if `amount < 0`; else `ok`.
6. `days_left` = days from local today to the Period end, including today, clamped to `[0, Period length]`. Compute local today in the Household time zone.
7. `per_week` = `null` if `status` is not `ok` or `days_left` is 0; else `amount` if `days_left ≤ 7`; else `floor(amount × 7 ÷ days_left)`.
8. `stale` = `true` if Data-as-of is missing or older than 36 hours before `now`.

Planned Purchases are not read.

### Time zone

- Add a setting `household_timezone`, default `Pacific/Auckland`.
- Use it only for the Spending allowance: local today, `days_left`, and the Period that the JSON route resolves.
- Do not change Period resolution for other tools. That would change behaviour outside this spec.
- Superseded by ticket 07: all tools and the sync now use the Household time zone.

### Output shape

`get_budget` gains a `spending_allowance` block. The JSON route returns the same block.

```ts
type SpendingAllowance = {
  period: string;                       // Period key, e.g. "2026-10"
  status: "ok" | "over" | "no_budget";
  amount_cents: number | null;          // signed; null when no_budget
  per_week_cents: number | null;
  days_left: number;
  flexible_remaining_cents: number | null;
  committed_overspend_cents: number | null;
  uncategorized_spent_cents: number | null;
  uncategorized_count: number;          // Uncategorized spend Transactions in the Period
  data_as_of: string | null;
  stale: boolean;
};
```

- When `status` is `no_budget`, the read must not create a Budget.
- One engine function produces this block from `(ctx, period)`. `get_budget` and the route call it. Neither does its own arithmetic.

### Tools

- `manage_categories`:
  - The `create` action requires `kind`. A create without `kind` is refused.
  - Add a `set_kind` action: `{id, kind}`. It is audited and refused in read-only mode, like the other writes.
  - `merge` keeps the target's `kind`.
  - Refuse `set_kind` on the Uncategorized system category.
- `list_categories` returns `kind` for each category.
- `set_category_rule` gains `dry_run` (default `false`). With `dry_run`, it writes nothing and returns how many Transactions the rule would move, per source category.

### JSON route (Seam 2)

- `GET /widget/summary` returns `{ spending_allowance }` for the current Period. It resolves the Period from local today in the Household time zone.
- Mount the route on the tailnet listener only. The public OAuth listener does not serve it.
- The route has no logic beyond calling the engine function and serializing the result. Later widgets (e.g. upcoming payments) add sibling keys to the same response.

### Workflow guides

- `plan_purchase`: for a purchase funded from savings, tell the agent to allocate the cost to the Home projects Envelope before the payment goes out, after the Member approves.
- `create_budget`: tell the agent to show the committed/flexible totals and the resulting Spending allowance before the Member confirms allocations.
- Any flow that creates a category must ask the Member for `kind`.

### Data rollout (performed through the tools after deploy, with Member approval)

These are data changes, not code. The agent performs them through the MCP tools and previews each rule with `dry_run` first.

1. Mark flexible: Food, Lifestyle, Household, Transport, Health, Appearance, Professional Services.
2. Keep committed: Housing, Utilities, Education, Savings, Credit Card (paying down the balance), Gifts & Holidays.
3. Create committed **Insurance**. Add merchant rules for AIA, Tower, State, IAG, Partners Life, Southern Cross Pet. Backfill.
4. Create committed **Subscriptions**. Add merchant rules for Spotify, Disney+, Netflix, Amazon Prime, Google, Anthropic. Backfill.
5. Create committed **Home projects** with no rules. Use it through the plan-purchase flow.

Merchant rules outrank Akahu-group rules in the matcher, so the splits need no priority changes.

## Testing Decisions

- A good test drives the system through its public seam and asserts on the output. It does not assert on internal helpers, SQL, or intermediate values.
- **Seam 1 (primary):** invoke tools through `invokeTool` against an in-memory, migrated sqlite with a fixed clock (`testContext`). Seed data through the fake Akahu client, sync, and categorization, as the budget tests do. Prior art: the ticket 05 budget tests, ticket 07 planned-purchase tests, and ticket 10–12 income tests.
  - `get_budget` → `spending_allowance`:
    - flexible pool with one overspent flexible Envelope (pooled, negative part counts);
    - committed underspend adds nothing;
    - committed overspend subtracts;
    - Uncategorized spend subtracts, and `uncategorized_count` is correct;
    - a `TRANSFER` and an income credit do not change the figure;
    - a Planned Purchase does not change the figure;
    - `per_week` for more than 7 days left, for 7 or fewer, for a negative amount, and for 0 days left;
    - `days_left` near midnight NZ time, using a fixed clock just before and after local midnight (UTC differs);
    - `status` `ok`, `over`, and `no_budget`, and that a `no_budget` read creates no Budget;
    - `stale` at 35 and 37 hours, and when Data-as-of is missing.
  - `manage_categories`: create without `kind` is refused; create with `kind` works; `set_kind` changes the allowance; `set_kind` on Uncategorized is refused; `merge` keeps the target's `kind`; writes are audited and refused in read-only mode.
  - `list_categories` returns `kind`.
  - `set_category_rule` with `dry_run` returns counts and changes nothing.
  - Migration: existing categories are `committed` after migrating.
  - Workflow guides: the `plan_purchase` and `create_budget` guides contain the new steps. Prior art: the ticket 09 guide tests.
- **Seam 2 (thin):** one HTTP-level test file for the route. Prior art: the ticket 13 Phase-2 listener tests.
  - The tailnet router serves `GET /widget/summary`, and its `spending_allowance` equals `get_budget`'s block for the same Period and clock.
  - The public listener does not serve the route (404, or 401 before routing).

## Out of Scope

- The Android widget itself (KWGT preset or native Glance app).
- The upcoming-payments widget and any recurring-payments model. That needs its own grilling session.
- Per-Member allowances.
- More frequent Akahu sync, and pending transactions (the live client fetches only settled Transactions).
- **Known gap: refunds.** A refund is classified as Unclassified income, so it does not raise the Spending allowance. A Member can fix one with `classify_income(null)`. Changing this belongs to a separate decision under ADR-0009.
- **Known gap: card repayment credits counted as income.** About 60 credits on the Visa (about $51k), mostly "PAYMENT THANKYOU" repayments, are classified as Unclassified income. This inflates actual income and Household headroom. It does not change the Spending allowance. Raise a separate issue.
- **Known gap: savings-funded purchases and Household headroom.** Allocating a savings-funded purchase to Home projects makes Household headroom negative for that Period, because money drawn from savings is not Income.
- Changing Period resolution to local time for other tools.
- A stored history of past Spending allowance values, or per-Period flags.

## Further Notes

- Assumptions verified against the local DB (Oct 2024 to Jul 2026): Savings and Credit Card Envelopes hold no Transactions. Savings transfers and card repayments are `TRANSFER` type and are excluded from spend, so card purchases are not counted twice.
- The local DB is stale (last sync 22 Jul 2026). The live database is on the Pi. Check the October Budget there before the rollout: the local DB has no Budget for 2026-10, so the widget would show `no_budget`.
- Gym (Anytime Fitness) is cancelled from Sep 2026, so Health needs no split.
- Transport stays flexible. Annual rego and WOF are lumpy but rare, and a split is not worth it.

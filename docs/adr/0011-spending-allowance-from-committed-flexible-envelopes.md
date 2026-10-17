# The Spending allowance is derived from Envelopes split into Committed and Flexible

The **Spending allowance** is one Household figure for the current Period, computed server-side from Envelopes. Every Budget Category carries a permanent **Committed** or **Flexible** flag. The allowance is the sum of `remaining` over Flexible Envelopes (pooled, not clamped), minus the overspend on each Committed Envelope, minus Uncategorized spend. Unspent Committed money never counts, and Planned Purchases are not subtracted. This refines ADR-0004: the Envelope model already records what the Household decided is flexible money, so the allowance reads that decision instead of inventing a second one.

## Considered Options

- **Income-derived** (expected income − commitments − flexible spend) — rejected: it ignores the allocations the Household set, so money meant for the buffer or savings would show as spendable.
- **Clamp each Flexible Envelope at zero** — rejected: an overspend in Food is money already gone; clamping overstates what is left.
- **Ignore Committed Envelopes entirely** — rejected: a higher-than-allocated bill still has to be paid from somewhere, and that somewhere is Flexible money. Only the overspend counts; Committed underspend is withheld because the bill may not have come out yet.
- **Ignore Uncategorized spend until categorized** — rejected: real money has left the account, and it is usually Flexible. Subtracting it keeps the figure cautious.
- **Subtract Planned Purchases** — rejected: CONTEXT.md defines a Planned Purchase as a list entry, not a reservation.
- **Flag per Envelope (per Period) or per Transaction** — rejected: a per-Period flag adds upkeep for no use, and a per-Transaction flag reaches into categorization. Mixed categories are split into separate Budget Categories instead (e.g. Insurance out of Household, Subscriptions out of Lifestyle).
- **Per-Member allowances** — rejected for now: Envelopes are Household-level (ADR-0004) and there is no split rule.

## Consequences

- The flag is per category and applies to every Period, so changing it recomputes past Periods' allowance. The allowance is a live figure, not a stored report.
- Existing categories migrate to Committed, so the allowance starts too low rather than too high. Creating a category requires the flag.
- A purchase funded from savings must be allocated (to a Committed Home projects Envelope) before it is paid; otherwise its spend lands as Uncategorized or Flexible overspend and drives the allowance far negative. Because savings drawdowns are not Income, Household headroom goes negative in that Period — accepted for now.
- Refunds are classified as Unclassified income (ADR-0009), so a refund does not raise the allowance. Accepted as a known gap.
- "Today" and days left for the allowance use the Household's local time zone; other tools keep their existing Period resolution.

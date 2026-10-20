# 04: "Bills this week" card in the app

**What to build:** The app shows a "Bills this week" card below the Spending allowance breakdown. The card lists the week's Bill occurrences with ticks for paid and a warning colour for overdue, and the header shows the total still to leave the Accounts.

**Blocked by:** 02 (Paid Bill occurrences and estimated amounts)

**Status:** resolved

Spec: `.scratch/upcoming-bills/spec.md` (sections "API contract", "App")

- [x] `/api/spending-allowance` returns a `bills` block next to `spending_allowance`, built by the Bills module. It is present in the no-Budget state
- [x] The contract fixtures (`ok`, `over`, `no_budget`, `stale`) contain the `bills` block, with at least one upcoming, one due, one paid and one overdue row in total. A new fixture has no Bills today and a `next_upcoming` value. The fixtures are regenerated, not edited by hand
- [x] The app parses and caches the `bills` block with the Spending allowance snapshot. A response without `bills` still parses
- [x] The Android contract test parses every fixture
- [x] A pure function maps the cached response to the card model (header total, rows, or "No bills this week"). The app does no money math, filtering or sorting
- [x] The card shows weekday, name and `amount_display` per row, a tick for paid, a warning colour for overdue, and the stale treatment that the Spending allowance uses
- [x] JVM tests cover the card model for every fixture and for a response without `bills`

## Comments

- 2026-10-20: The agent implemented all seven items. The server suite (236 tests) and the Android JVM suite (115 tests) pass. Decisions for review:
  - ADR-0013 says "the app formats cents for display", and it retires the `*_display` strings. This spec tells the card to show `amount_display` and `due_total_display` as given. The card follows the spec, because the server owns the "~" estimate marker. Amend ADR-0013, or change the card to format `amount_cents` itself.
  - If the response has no `bills` block, the app hides the card. The spec gives the "Open the app to load bills" text only for the widget.
  - If the app cannot read the `bills` block (for example, a new `state` value from a later server), the app keeps the Spending allowance and hides the card. Only the Spending allowance block can fail a parse.
  - The stale treatment copies the Spending allowance rule. Stale greys the header total and the rows. An overdue row keeps the warning colour.
  - The app parses only the Bills fields that the card reads. Ticket 05 adds `today` and `next_upcoming`.
  - The phone formats the weekday from `due_date`. This is date formatting, not money math.
  - The fixtures add a paid Spotify debit of $26.49 against an expected $25.99. The paid row thus shows the actual debit. An allocated Subscriptions Envelope covers the debit, so every `spending_allowance` block is unchanged.

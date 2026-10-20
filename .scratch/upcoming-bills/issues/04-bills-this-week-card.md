# 04: "Bills this week" card in the app

**What to build:** The app shows a "Bills this week" card below the Spending allowance breakdown. The card lists the week's Bill occurrences with ticks for paid and a warning colour for overdue, and the header shows the total still to leave the Accounts.

**Blocked by:** 02 (Paid Bill occurrences and estimated amounts)

**Status:** ready-for-agent

Spec: `.scratch/upcoming-bills/spec.md` (sections "API contract", "App")

- [ ] `/api/spending-allowance` returns a `bills` block next to `spending_allowance`, built by the Bills module. It is present in the no-Budget state
- [ ] The contract fixtures (`ok`, `over`, `no_budget`, `stale`) contain the `bills` block, with at least one upcoming, one due, one paid and one overdue row in total. A new fixture has no Bills today and a `next_upcoming` value. The fixtures are regenerated, not edited by hand
- [ ] The app parses and caches the `bills` block with the Spending allowance snapshot. A response without `bills` still parses
- [ ] The Android contract test parses every fixture
- [ ] A pure function maps the cached response to the card model (header total, rows, or "No bills this week"). The app does no money math, filtering or sorting
- [ ] The card shows weekday, name and `amount_display` per row, a tick for paid, a warning colour for overdue, and the stale treatment that the Spending allowance uses
- [ ] JVM tests cover the card model for every fixture and for a response without `bills`

# 01: Spending ring on the widget

**What to build:** The widget shows a ring at its right edge. The ring fills with the share of the Flexible allocation that the Household has spent this Period. The server sends the Flexible allocation, and `get_budget` returns it too.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

Spec: `.scratch/widget-spending-ring/spec.md`

- [x] The Spending allowance has `flexible_allocated_cents`: the Flexible Envelopes' allocations, without Uncategorized. It is null when there is no Budget. Engine tests cover it
- [x] `/api/spending-allowance` and `get_budget` both return the field. The contract fixtures are regenerated
- [x] The app reads the field, and the contract test parses every fixture
- [x] A pure function maps the cached response to a ring model (fill, colour role, or no ring). Unit tests cover every row of the spec's ring state table, the clamps, and a zero allocation
- [x] The widget draws the ring on a bitmap at the right edge of the row, in every state that shows a ring
- [x] The widget layout still fits at about 3×1

## Comments

- 2026-10-19: The agent implemented items 1 to 5, and the server and app unit tests pass. The ring is a fixed 36dp image with a 12dp gap, so it takes 48dp of row width. The agent did not check the 3×1 fit on a phone. Ticket 04 checks it. At the minimum resize width (110dp), the ring leaves little room for the amount.
- 2026-10-19: The agent checked the ring on Braeden's Pixel 8 Pro at density 2.25. At 4×1 and 3×1 (about 302dp), the ring and the text fit. At 2 cells (about 196dp), the amount wrapped onto two lines. Braeden chose to hide the ring below 240dp wide. The widget now uses responsive sizes for this. If there are Uncategorized Transactions, the badge has little space at 3×1. The agent did not check this case.

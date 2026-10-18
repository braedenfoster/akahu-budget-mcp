# 01: Spending ring on the widget

**What to build:** The widget shows a ring at its right edge. The ring fills with the share of the Flexible allocation that the Household has spent this Period. The server sends the Flexible allocation, and `get_budget` returns it too.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

Spec: `.scratch/widget-spending-ring/spec.md`

- [ ] The Spending allowance has `flexible_allocated_cents`: the Flexible Envelopes' allocations, without Uncategorized. It is null when there is no Budget. Engine tests cover it
- [ ] `/api/spending-allowance` and `get_budget` both return the field. The contract fixtures are regenerated
- [ ] The app reads the field, and the contract test parses every fixture
- [ ] A pure function maps the cached response to a ring model (fill, colour role, or no ring). Unit tests cover every row of the spec's ring state table, the clamps, and a zero allocation
- [ ] The widget draws the ring on a bitmap at the right edge of the row, in every state that shows a ring
- [ ] The widget layout still fits at about 3×1

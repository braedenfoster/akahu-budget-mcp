# 03: Pace tick on the ring

**What to build:** A small tick on the ring shows how far through the Period the Household is. When the fill passes the tick, spending is ahead of pace. The tick shows on the widget ring and on the in-app ring.

**Blocked by:** 01, 02

**Status:** ready-for-agent

Spec: `.scratch/widget-spending-ring/spec.md`

- [ ] The Spending allowance has `period_days` in every state. An engine test covers a pay-cycle Period
- [ ] `/api/spending-allowance` and `get_budget` both return the field. The contract fixtures are regenerated
- [ ] The ring model gains a pace fraction: `(period_days − days_left) ÷ period_days`, limited to 0..1. Unit tests cover the first day, the last day and the clamps
- [ ] The widget ring and the in-app ring draw the tick in every state that shows a ring

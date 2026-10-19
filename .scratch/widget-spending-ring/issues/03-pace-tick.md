# 03: Pace tick on the ring

**What to build:** A small tick on the ring shows how far through the Period the Household is. When the fill passes the tick, spending is ahead of pace. The tick shows on the widget ring and on the in-app ring.

**Blocked by:** 01, 02

**Status:** resolved

Spec: `.scratch/widget-spending-ring/spec.md`

- [x] The Spending allowance has `period_days` in every state. An engine test covers a pay-cycle Period
- [x] `/api/spending-allowance` and `get_budget` both return the field. The contract fixtures are regenerated
- [x] The ring model gains a pace fraction: `(period_days − days_left) ÷ period_days`, limited to 0..1. Unit tests cover the first day, the last day and the clamps
- [x] The widget ring and the in-app ring draw the tick in every state that shows a ring

## Comments

- 2026-10-19: The agent implemented all four items. The server and app unit tests pass. The tick is a radial line from the ring's outer edge to one stroke width inside the ring. The widget tints the whole ring bitmap one colour, so the tick has the fill's colour. The inner part keeps the tick visible after the fill passes it. The in-app ring uses the same tick. The agent did not check the tick on a phone. Ticket 04 checks it.
- 2026-10-19: `days_left` counts today, so on the last day of the Period the tick is at 30/31, not at the top. The fill arc has a round cap, so the fill looks like it passes the tick about half a stroke early (about 7° on the widget ring). Ticket 04 can decide if this needs a change.

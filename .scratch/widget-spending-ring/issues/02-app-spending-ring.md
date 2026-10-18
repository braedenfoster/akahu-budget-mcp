# 02: Spending ring on the in-app screen

**What to build:** The in-app screen shows the same ring as the widget, next to the headline amount. The ring uses the same ring model, so the app and the widget always agree.

**Blocked by:** 01

**Status:** resolved

Spec: `.scratch/widget-spending-ring/spec.md`

- [x] The screen draws the ring with a Compose `Canvas`, from the ring model in ticket 01
- [x] The ring shows the ok, over and stale colours from the spec's ring state table
- [x] The screen shows no ring when the ring model has no ring
- [x] The ring does not push the amount, per week or breakdown off a phone-width screen

## Comments

- 2026-10-19: The agent implemented all four items, and the app unit tests pass. The ring is a 56dp Canvas with a 16dp gap at the right of the headline. The headline text has the remaining width, so the ring cannot push it off the screen. At a large font scale, a long amount can wrap onto two lines. The stale ring uses the same grey as the in-app greyed number. The agent did not check the screen on a phone. Ticket 04 checks it.

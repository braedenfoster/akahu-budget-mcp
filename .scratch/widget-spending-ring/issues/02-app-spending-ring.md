# 02: Spending ring on the in-app screen

**What to build:** The in-app screen shows the same ring as the widget, next to the headline amount. The ring uses the same ring model, so the app and the widget always agree.

**Blocked by:** 01

**Status:** ready-for-agent

Spec: `.scratch/widget-spending-ring/spec.md`

- [ ] The screen draws the ring with a Compose `Canvas`, from the ring model in ticket 01
- [ ] The ring shows the ok, over and stale colours from the spec's ring state table
- [ ] The screen shows no ring when the ring model has no ring
- [ ] The ring does not push the amount, per week or breakdown off a phone-width screen

# 05: "Bills today" widget

**What to build:** A Member adds a separate "Bills today" widget to the home screen. It shows today's Bill occurrences and recent ones that are still due, overdue or just paid. With no Bills today, it shows the next upcoming Bill. A tap opens the app.

**Blocked by:** 04 ("Bills this week" card in the app)

**Status:** ready-for-agent

Spec: `.scratch/upcoming-bills/spec.md` (section "App", "Bills today" state table)

- [ ] A new Glance widget with its own receiver and widget info. It reads the same cached snapshot as the Spending widget
- [ ] A snapshot change updates both widgets. The widget uses the existing 3-hourly and 00:05 refresh, with no new schedule
- [ ] A pure function maps the cached response to the widget model for every row of the spec's "Bills today" state table
- [ ] The widget shows at most 3 rows, then "+N more"
- [ ] With an empty `today`, it shows "No bills today", plus "Next: <name> · <weekday> · <amount>" when `next_upcoming` is set
- [ ] A response without `bills` shows "Open the app to load bills"
- [ ] A tap opens the app
- [ ] JVM tests cover every state table row and the "+N more" cut

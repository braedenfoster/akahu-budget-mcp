# 05: "Bills today" widget

**What to build:** A Member adds a separate "Bills today" widget to the home screen. It shows today's Bill occurrences and recent ones that are still due, overdue or just paid. With no Bills today, it shows the next upcoming Bill. A tap opens the app.

**Blocked by:** 04 ("Bills this week" card in the app)

**Status:** resolved

Spec: `.scratch/upcoming-bills/spec.md` (section "App", "Bills today" state table)

- [x] A new Glance widget with its own receiver and widget info. It reads the same cached snapshot as the Spending widget
- [x] A snapshot change updates both widgets. The widget uses the existing 3-hourly and 00:05 refresh, with no new schedule
- [x] A pure function maps the cached response to the widget model for every row of the spec's "Bills today" state table
- [x] The widget shows at most 3 rows, then "+N more"
- [x] With an empty `today`, it shows "No bills today", plus "Next: <name> · <weekday> · <amount>" when `next_upcoming` is set
- [x] A response without `bills` shows "Open the app to load bills"
- [x] A tap opens the app
- [x] JVM tests cover every state table row and the "+N more" cut

## Comments

- 2026-10-20: The agent implemented all eight items. The server suite (236 tests) and the Android JVM suite (126 tests) pass. Decisions for review:
  - The app now parses `today`, `next_upcoming` and `data_as_of` in the `bills` block. All three are required fields, so a block without one of them is unreadable, and the app hides the card.
  - If the data is stale, the widget greys the rows and the "Next: …" line, and it shows "as of <d MMM>", as the Spending widget does. An overdue row keeps the warning colour, as on the card.
  - The widget shows the offline mark when the latest fetch failed, as the Spending widget does.
  - The "Open the app to load bills" text also shows when the app cannot read the `bills` block (for example, a new `state` value from a later server). In that case, opening the app does not help; an app update does. The text follows the spec.
  - "Next: <name> · <weekday> · <amount>" gives only the weekday, also for a quarterly or yearly Bill weeks away. This follows the spec. Decide in review whether a date is better there.
  - The widget cannot become shorter than 110dp, so that 3 rows and "+N more" always fit.
  - `OccurrenceRow` moved to `allowance/`, next to `SpendingRing`, because the card and the widget share it. The two widgets share one frame and one update function (`updateAllWidgets`).

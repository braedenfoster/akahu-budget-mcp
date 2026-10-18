# 06: Glance widget and background refresh

**What to build:** A resizable home-screen widget that shows the Spending allowance in each widget state, kept fresh by WorkManager.

**Blocked by:** 05

**Status:** resolved

Spec: `.scratch/native-android-app/spec.md` (Widget, Refresh)

- [x] A pure function maps (cached response, last fetch result, auth state) to a widget state
- [x] Unit tests cover every row of the spec's widget state table: ok, over, no budget, stale, signed out, offline
- [x] The Uncategorized badge shows when `uncategorized_count > 0`, in every state that shows a number (unit test)
- [ ] The Glance widget renders each state, at about 3×1 and resizable
- [ ] Tapping the widget opens the app
- [ ] WorkManager fetches every 3 hours with a network constraint
- [ ] One fetch runs shortly after local midnight in `Pacific/Auckland`
- [x] The app never calls a sync or `force` refresh

## Comments

- `widget/WidgetState.kt` holds the pure mapping. `widget/WidgetStateTest.kt` tests each row, the badge, and these combinations:
  - A stale figure that then goes offline shows both marks: the greyed number with "as of <date>", and "offline".
  - Both `FetchFailure.Offline` and `FetchFailure.ServerError` give the offline mark.
  - "No budget" shows no badge, because it shows no number. It can show the offline mark.
  - When the Member is signed in but nothing is cached, the widget shows "Tap to load".
- `refresh/MidnightSchedule.kt` computes the delay to 00:05 in `Pacific/Auckland`. `MidnightScheduleTest` covers both DST changes.
- `refresh/RefreshScheduler.kt` enqueues these jobs:
  - A 3-hourly periodic job (`UPDATE`).
  - A one-time midnight job (`KEEP`).
  - A one-time job when the first widget is added.
  - All three jobs need a network connection.
- The midnight job cannot queue itself while it runs. The next 3-hourly run or app start queues the next midnight job.
- `BudgetApp` re-reads the cache when the auth state changes. It updates the widget when the snapshot changes. The worker also updates the widget before it returns.
- A failed fetch returns `Result.retry()`. WorkManager then retries with its default backoff.
- The existing `SpendingAllowanceApiTest` covers "no sync or `force`".
- These items need a phone to verify, so they are not ticked:
  - Rendering each state at 3×1 and resized.
  - The tap that opens the app.
  - Real 3-hourly and midnight scheduling.
- Doze can delay the midnight job until the next maintenance window.

# 06: Glance widget and background refresh

**What to build:** A resizable home-screen widget that shows the Spending allowance in each widget state, kept fresh by WorkManager.

**Blocked by:** 05

**Status:** ready-for-agent

Spec: `.scratch/native-android-app/spec.md` (Widget, Refresh)

- [ ] A pure function maps (cached response, last fetch result, auth state) to a widget state
- [ ] Unit tests cover every row of the spec's widget state table: ok, over, no budget, stale, signed out, offline
- [ ] The Uncategorized badge shows when `uncategorized_count > 0`, in every state that shows a number (unit test)
- [ ] The Glance widget renders each state, at about 3×1 and resizable
- [ ] Tapping the widget opens the app
- [ ] WorkManager fetches every 3 hours with a network constraint
- [ ] One fetch runs shortly after local midnight in `Pacific/Auckland`
- [ ] The app never calls a sync or `force` refresh

# 04: Deploy the ring and check it on both phones

**What to build:** The Pi serves the new fields, and both phones run an app with the ring and the pace tick.

**Blocked by:** 01, 02, 03

**Status:** ready-for-human

Spec: `.scratch/widget-spending-ring/spec.md`

The app requires every contract field. If a new app reads an old server, it cannot parse the response. Deploy the server first.

- [x] Back up the Pi database (method in the `pi-deployment` memory note)
- [x] Deploy the server to the Pi with `deploy.sh`
- [x] `get_budget` returns `flexible_allocated_cents` and `period_days`
- [ ] Build the signed release APK, and install it on both phones
- [ ] On each phone, the widget ring and the in-app ring match `get_budget`: spent share and Period position
- [x] The widget ring stays legible at about 3×1 and when resized. Below 240dp wide, the widget shows no ring

## Comments

- 2026-10-19: The agent backed up the Pi database to `data/budget.sqlite.bak.pre-pace-tick-20261019` and deployed `39bf773`. The Pi now serves `flexible_allocated_cents` and `period_days`. On 19 Oct, Period `2026-10` has 31 days with 27 left, so the expected fill is about 3.5% and the tick is at about 13% (46°). The agent installed the signed release APK on Braeden's Pixel 8 Pro. The second phone still runs an older app that ignores the new fields.
- 2026-10-19: On Braeden's Pixel 8 Pro, the widget (full width) and the in-app ring both match `get_budget`: $1,851.41, a fill of about 3.5% and a tick at about 46°. The fill has round caps, so a small fill shows as a short pill at the top of the ring. The agent did not check the resized widget or the second phone.
- 2026-10-19: On the Pixel, the agent checked the resized widget. At 3 cells, the ring and its tick are legible, and the amount stays on one line. At 2 cells (about 196dp), the widget shows no ring, and the amount stays on one line. There were no Uncategorized Transactions, so the agent did not check the badge at 3×1.

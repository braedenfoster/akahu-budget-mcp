# 04: Deploy the ring and check it on both phones

**What to build:** The Pi serves the new fields, and both phones run an app with the ring and the pace tick.

**Blocked by:** 01, 02, 03

**Status:** ready-for-human

Spec: `.scratch/widget-spending-ring/spec.md`

The app requires every contract field. If a new app reads an old server, it cannot parse the response. Deploy the server first.

- [ ] Back up the Pi database (method in the `pi-deployment` memory note)
- [ ] Deploy the server to the Pi with `deploy.sh`
- [ ] `get_budget` returns `flexible_allocated_cents` and `period_days`
- [ ] Build the signed release APK, and install it on both phones
- [ ] On each phone, the widget ring and the in-app ring match `get_budget`: spent share and Period position
- [ ] The widget ring stays legible at about 3×1 and when resized

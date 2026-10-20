# 06: Rollout to the Pi and both phones

**What to build:** The Household sees its real Bills on both phones. The server on the Pi has the first confirmed Bills, and both phones have the card and the "Bills today" widget.

**Blocked by:** 03 (Bill candidates and `review_spending`), 05 ("Bills today" widget)

**Status:** ready-for-human

Spec: `.scratch/upcoming-bills/spec.md` (section "Further Notes", rollout order)

- [ ] Deploy the server to the Pi. Check that the migration ran
- [ ] In Claude, run `review_spending`. Confirm or decline each Bill candidate against the Pi data
- [ ] Add quarterly and yearly Bills by hand (for example, rates) with `manage_bills` `create`
- [ ] Install the APK on Braeden's Pixel and the second phone. Add the "Bills today" widget on both
- [ ] On a day when a Bill is due, compare both phones with `get_upcoming_bills`
- [ ] On the morning after, check that the Bill shows paid with a tick on the card and the widget

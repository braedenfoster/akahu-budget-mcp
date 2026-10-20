# 06: Rollout to the Pi and both phones

**What to build:** The Household sees its real Bills on both phones. The server on the Pi has the first confirmed Bills, and both phones have the card and the "Bills today" widget.

**Blocked by:** 03 (Bill candidates and `review_spending`), 05 ("Bills today" widget)

**Status:** ready-for-human

Spec: `.scratch/upcoming-bills/spec.md` (section "Further Notes", rollout order)

- [x] Deploy the server to the Pi. Check that the migration ran
- [x] In Claude, run `review_spending`. Confirm or decline each Bill candidate against the Pi data
- [ ] Add quarterly and yearly Bills by hand (for example, rates) with `manage_bills` `create`
- [ ] Install the APK on Braeden's Pixel and the second phone. Add the "Bills today" widget on both
- [ ] On a day when a Bill is due, compare both phones with `get_upcoming_bills`
- [ ] On the morning after, check that the Bill shows paid with a tick on the card and the widget

## Comments

- 2026-10-20: The agent did the first part of the rollout.
  - The agent backed up the Pi database to `data/budget.sqlite.bak.pre-upcoming-bills-20261020`. Then the agent deployed `a2bbc33`. All 12 migrations ran, and the `bills` and `declined_bill_candidates` tables exist. The startup sync passed.
  - The agent went through the 18 Bill candidates with Braeden through the tailnet MCP tools (`list_bill_candidates`, `manage_bills`), not through a Claude Desktop `review_spending` session.
  - Braeden confirmed 14 candidates, with short names: 1Password, AIA GoCardless 1, AIA, Amazon Prime, Mortgage 032, Mortgage 036, School fees, Disney+, Google One, IAG, Mighty Mobile, Pet insurance, Spotify, Watercare.
  - The GoCardless AIA candidate has two equal debits on each due date. Braeden confirmed it twice, as "AIA GoCardless 1" and "AIA GoCardless 2". The Pi now has 15 active Bills and no Bill candidates.
  - Braeden declined INTEREST - PURCHASES, INTERNATIONAL TXN FEE, IRD WITHHOLDING TAX and the Spotify creators podcast subscription.
  - School fees is due on Monday. The debits land on Monday, not on Sunday as the spec's Further Notes say.
  - Detection did not propose Netflix, 2degrees or a second AIA policy on the 26th. Six months of data show no steady pattern for them.
  - The agent installed the `a2bbc33` release APK on Braeden's Pixel 8 Pro. Nobody has checked the card or added the "Bills today" widget yet.
  - Still open: the hand-entered quarterly and yearly Bills, the second phone, the due-day comparison, and the morning-after check.

# 03: Bill candidates and `review_spending`

**What to build:** Claude proposes Bill candidates from Transaction history, and a Member confirms or declines each one. `review_spending` offers new candidates and flags missed Bill occurrences, so that a Member can end a cancelled Bill.

**Blocked by:** 01 (Hand-entered Bills and the Bills view in Claude)

**Status:** ready-for-agent

Spec: `.scratch/upcoming-bills/spec.md` (sections "Bill candidate detection", "MCP tools")

- [ ] Detection reads settled debits from about the last 6 months and excludes Internal transfers and Refunds
- [ ] Detection groups debits by merchant, else by description, so that "AP#..." `LOAN` and `STANDING ORDER` debits group
- [ ] Detection splits a group into amount clusters, so that the two AIA policies become two Bill candidates
- [ ] A Bill candidate needs at least 3 debits on a steady weekly, fortnightly or monthly interval. Its last debit is within about 1.5 intervals of today
- [ ] Detection proposes fixed mode for equal amounts and estimated mode for varying amounts
- [ ] `list_bill_candidates` returns the proposed name, cadence, anchor, amount mode, amount, matcher rule and supporting debits
- [ ] `manage_bills` `confirm` creates a Bill from a candidate, with optional changes. `decline` stores the declined candidate
- [ ] A pattern that an active Bill covers, or that a Member declined, is not proposed again
- [ ] The `review_spending` Workflow guide gains steps to flag missed occurrences (ask whether to end each Bill) and to confirm or decline candidates
- [ ] Seam 1 tests cover monthly, weekly and fortnightly patterns; the AIA split; "AP#..." types; a one-off excluded; an Internal transfer excluded; a stopped pattern excluded; declined and covered patterns excluded; confirm and decline

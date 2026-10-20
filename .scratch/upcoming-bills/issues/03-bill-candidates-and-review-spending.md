# 03: Bill candidates and `review_spending`

**What to build:** Claude proposes Bill candidates from Transaction history, and a Member confirms or declines each one. `review_spending` offers new candidates and flags missed Bill occurrences, so that a Member can end a cancelled Bill.

**Blocked by:** 01 (Hand-entered Bills and the Bills view in Claude)

**Status:** resolved

Spec: `.scratch/upcoming-bills/spec.md` (sections "Bill candidate detection", "MCP tools")

- [x] Detection reads settled debits from about the last 6 months and excludes Internal transfers and Refunds
- [x] Detection groups debits by merchant, else by description, so that "AP#..." `LOAN` and `STANDING ORDER` debits group
- [x] Detection splits a group into amount clusters, so that the two AIA policies become two Bill candidates
- [x] A Bill candidate needs at least 3 debits on a steady weekly, fortnightly or monthly interval. Its last debit is within about 1.5 intervals of today
- [x] Detection proposes fixed mode for equal amounts and estimated mode for varying amounts
- [x] `list_bill_candidates` returns the proposed name, cadence, anchor, amount mode, amount, matcher rule and supporting debits
- [x] `manage_bills` `confirm` creates a Bill from a candidate, with optional changes. `decline` stores the declined candidate
- [x] A pattern that an active Bill covers, or that a Member declined, is not proposed again
- [x] The `review_spending` Workflow guide gains steps to flag missed occurrences (ask whether to end each Bill) and to confirm or decline candidates
- [x] Seam 1 tests cover monthly, weekly and fortnightly patterns; the AIA split; "AP#..." types; a one-off excluded; an Internal transfer excluded; a stopped pattern excluded; declined and covered patterns excluded; confirm and decline

## Comments

- 2026-10-20: The agent implemented all ten items, and the full server suite passes. The agent checked detection against a copy of the local data (synced 22 Jul). Detection found every known Bill except 2degrees, whose debits are irregular. Decisions for review:
  - Detection uses the latest steady run of each amount cluster. An older break, such as school holidays, does not hide a current weekly pattern.
  - Each supporting debit must land in the match window (3 days before to 5 days after) of a proposed due date. Otherwise a confirmed Bill drifts away from its own debits. Detection drops old debits that miss. It drops the pattern when more than half of the run misses. Example: a debit every 4 weeks is not proposed as monthly.
  - An amount cluster splits where a sorted amount is more than 25% above the one before. This keeps price rises (Spotify +14%) and Watercare together. It splits the three AIA amounts.
  - A candidate is covered when more than half of its debits pay active Bills (the Bills view matching). Thus a Bill for one AIA policy does not hide the other. Two equal debits on each date (AIA GoCardless) stay a candidate until two Bills cover them.
  - A decline stores the matcher rule and the candidate amount. A later candidate with the same rule, and a cluster range (widened by 25%) that holds that amount, is declined.
  - `candidate_id` is the Akahu id of the latest supporting debit. It changes when a new debit lands. `confirm` and `decline` then fail with a clear error.
  - `list_bills` gained `period` and per-Bill `missed_due_dates`, because `get_upcoming_bills` drops missed occurrences. Due dates before the Bill was created are left out.
  - The data still produces noise candidates: card interest, international fees and withholding tax. A Member declines them once. The spec does not exclude them, and steady amounts are not required.
  - Migration 0009 dates Transactions in the Household time zone. On the Pi, proposed days are one day later than the spec's "Known Bills" list (AIA on the 27th, education on Monday).


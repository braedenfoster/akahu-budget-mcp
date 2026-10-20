# Upcoming Bills

Status: ready-for-agent

_Vocabulary follows `CONTEXT.md` (Household, Member, Transaction, Internal transfer, Refund, Bill, Bill occurrence, Bill candidate, Data-as-of, Workflow guide). Also read ADR-0003 (the server owns all money math), ADR-0009 (the shared matcher), ADR-0013 (native Android app) and ADR-0014 (Bills are detected, then confirmed). The native app spec is `.scratch/native-android-app/spec.md`._

## Problem Statement

The Household pays many Bills: insurance, the mortgage, education, utilities and subscriptions. The app shows only the Spending allowance. A Member cannot see which Bills leave the Accounts this week, or which Bills are due today. A Member also cannot see whether a Bill went through, or whether a Bill stopped because it was cancelled.

## Solution

The server keeps a list of Bills that a Member confirmed. The server proposes Bill candidates from Transaction history, and a Member confirms or declines each one through Claude. From the Bills, the server calculates the Bill occurrences for the next 7 days and gives each one a state (upcoming, due, paid, overdue). The app shows a "Bills this week" card below the Spending allowance breakdown. A new home-screen widget shows the Bill occurrences for today. Claude can also tell a Member which Bills are due this week.

## User Stories

1. As a Member, I want a "Bills this week" card in the app, so that I know which Bills leave the Accounts in the next 7 days.
2. As a Member, I want each row to show the day, the Bill name and the amount, so that I can read the card at a glance.
3. As a Member, I want the card to cover today and the next 6 days, so that the list never shrinks to one day at the end of a calendar week.
4. As a Member, I want overdue Bill occurrences at the top of the card, so that I see a problem first.
5. As a Member, I want overdue rows in a warning colour, so that they stand out from normal rows.
6. As a Member, I want a total in the card header, so that I know how much money still has to leave the Accounts this week.
7. As a Member, I want the total to exclude paid Bill occurrences, so that the total counts only money that has not left yet.
8. As a Member, I want a paid Bill occurrence to show a tick, so that I know the Bill went through.
9. As a Member, I want a paid Bill occurrence to show the actual debit amount, so that I see what the bank took.
10. As a Member, I want a paid Bill occurrence to stay visible for 2 days after its due date, so that the next-day sync still gives me a chance to see the tick.
11. As a Member, I want a Bill with a varying amount to show an estimate with "~", so that I know the figure is not exact.
12. As a Member, I want a Bill with a steady amount to show the exact amount, so that I do not see a "~" without reason.
13. As a Member, I want a Bill occurrence on its due date to show as "due" and not as "overdue", so that bank lag does not cause a false alarm.
14. As a Member, I want a Bill occurrence with no debit 3 to 5 days after its due date to show as overdue, so that I can check the Account.
15. As a Member, I want a Bill occurrence with no debit more than 5 days after its due date to leave the list, so that old problems do not stay on my phone.
16. As a Member, I want a separate "Bills today" widget, so that I can put it where I want, apart from the Spending widget.
17. As a Member, I want the "Bills today" widget to show the Bill occurrences due today, so that I know what leaves the Accounts today.
18. As a Member, I want the widget to also show recent Bill occurrences that are still due or overdue, so that I see a Bill that has not gone through.
19. As a Member, I want the widget to show a Bill that was paid yesterday with a tick, so that I see the confirmation the next morning.
20. As a Member, I want the widget to show "No bills today" and the next upcoming Bill when no Bill is due today, so that the widget is still useful.
21. As a Member, I want the widget to show at most 3 rows and "+N more", so that the widget stays readable.
22. As a Member, I want a tap on the widget to open the app, so that I can see the full week.
23. As a Member, I want the widget to refresh on the same schedule as the Spending widget, so that both widgets show data from the same moment.
24. As a Member, I want the Bills to show the same stale message as the Spending allowance, so that I know why a due Bill has not turned paid.
25. As a Member, I want both phones to show the same Bills, so that both Members of the Household agree.
26. As a Member, I want Claude to propose Bill candidates from Transaction history, so that I do not type every Bill by hand.
27. As a Member, I want to confirm a Bill candidate through Claude, so that only real Bills reach my phone.
28. As a Member, I want to edit the name, cadence, due day and amount of a Bill when I confirm it, so that the Bill reads well and is due on the right day.
29. As a Member, I want to decline a Bill candidate, so that Claude does not propose it again.
30. As a Member, I want to end a Bill, so that a cancelled Bill (like the gym) stops showing.
31. As a Member, I want `review_spending` to flag a missed Bill occurrence, so that I can decide whether the Bill has ended.
32. As a Member, I want `review_spending` to offer new Bill candidates, so that new Bills reach the list without a separate session.
33. As a Member, I want weekly, fortnightly, monthly, quarterly and yearly Bills, so that the education AP, the mortgage, rates and car registration all fit.
34. As a Member, I want a monthly Bill due on the 31st to be due on the last day of a shorter month, so that it does not vanish in some months.
35. As a Member, I want an automatic payment that has only an "AP#..." description to count as a Bill, so that the mortgage and education payments show.
36. As a Member, I want two Bills from the same merchant on the same day (the two AIA policies) to stay separate, so that each one ticks when its own debit lands.
37. As a Member, I want a debit that lands a few days late (after a public holiday) to still mark the Bill occurrence as paid, so that bank timing does not cause a false "overdue".
38. As a Member, I want to ask Claude "what Bills are due this week?", so that I get the same answer in Claude Desktop as on my phone.
39. As a Member, I want Claude to list every active Bill, so that I can review the whole list.
40. As a Member, I want an Internal transfer (a card repayment, a move to savings) never to become a Bill or a Bill candidate, so that money that is not spend stays off the list.
41. As a Member, I want a one-off payment (a single rates payment) not to become a Bill candidate, so that the proposals stay accurate.
42. As a Member, I want a Bill candidate to stop being proposed when its debits stop, so that cancelled subscriptions (Hetzner, OpenRouter) are not proposed.

## Implementation Decisions

### Domain rules

- A Bill belongs to the Household. A Bill has:
  - a name,
  - a cadence (weekly, fortnightly, monthly, quarterly or yearly),
  - an anchor that sets the due dates (see below),
  - an amount mode (fixed or estimated),
  - an expected amount for fixed mode,
  - one matcher rule (match type and match value, from the four match types of the shared matcher),
  - a status (active or ended), with an end date when ended.
- Anchors:
  - Weekly: a weekday.
  - Fortnightly: one anchor date. Due dates are every 14 days from it.
  - Monthly: a day of the month, 1 to 31.
  - Quarterly and yearly: one anchor date. Due dates are every 3 or 12 months from it.
  - If the day does not exist in a month, the due date is the last day of that month.
- All dates are calendar dates in the Household time zone (`household_timezone`). "Today" is today in that time zone.
- Matching a debit to a Bill occurrence:
  - The Transaction is a debit. It is not an Internal transfer and not a Refund.
  - The Transaction passes the Bill's matcher rule.
  - The Transaction date is between 3 days before and 5 days after the due date.
  - A Transaction matches at most one Bill occurrence. A Bill occurrence matches at most one Transaction.
  - If one Transaction can match more than one Bill, use the Bill with the expected amount closest to the debit. This keeps the two AIA policies separate.
  - If one Transaction can match more than one occurrence of the same Bill (weekly windows overlap), use the occurrence with the nearest due date.
- The state of a Bill occurrence, in this order:
  1. **paid**: a Transaction matches it.
  2. **upcoming**: the due date is after today.
  3. **due**: the due date is today, or 1 to 2 days before today.
  4. **overdue**: the due date is 3 to 5 days before today.
  5. **missed**: the due date is more than 5 days before today.
- The amount of a Bill occurrence:
  - Paid: the actual debit amount.
  - Fixed mode: the expected amount.
  - Estimated mode: the median of the last 3 matched debits. If there are no matched debits yet, use the expected amount set at confirmation. Estimated amounts show with "~".
- The day offsets (−3/+5 for matching, 2 days for due, 5 days for overdue) are named constants in one place, so that they are easy to tune.

### Bill candidate detection

- Detection reads settled debits from about the last 6 months. It excludes Internal transfers and Refunds.
- Detection groups debits by a matcher key: the merchant if there is one, else the description. "AP#..." descriptions are stable, so they group well.
- Detection splits a group into amount clusters, so that two policies from one merchant become two Bill candidates.
- Detection proposes only weekly, fortnightly and monthly cadences. A Member can still confirm any cadence.
- A Bill candidate needs at least 3 debits on a steady interval. Its last debit must be within about one and a half intervals of today, so that stopped debits are not proposed.
- Detection does not propose a pattern that an active Bill already covers, or that a Member declined.
- Detection proposes fixed mode when the amounts are equal, and estimated mode when they vary.
- The server calculates Bill candidates when a tool asks for them. It does not store them. It stores only declined candidates, keyed by matcher rule and amount cluster.

### Schema

- A new `bills` table holds Bills with the fields above. It is separate from `mapping_rules` and `income_rules`. The reuse is in the matcher, not in the table (ADR-0014, as in ADR-0009).
- A new table holds declined Bill candidates.
- Matched Transactions are not stored on the Bill. The server matches them each time it calculates Bill occurrences. History is small, and this keeps edits and ends simple.

### Bills module

- One module calculates the Bills view for a given today. It owns occurrence dates, matching, states, amounts and totals. Both the MCP tool and the HTTP route call it (ADR-0013 pattern).
- The Bills view contains:
  - `occurrences`: the week list. It holds every Bill occurrence with a due date from today − 5 to today + 6, with two exclusions: missed occurrences, and paid occurrences with a due date more than 2 days before today. Overdue occurrences come first, then the rest by due date.
  - Each occurrence has the Bill id and name, due date, state, `amount_cents`, `amount_display` ("~" when estimated), and an `estimated` flag.
  - `today`: the occurrences in the week list with a due date on or before today. This gives the widget today's Bills, recent due and overdue ones, and paid ones from the last 2 days.
  - `next_upcoming`: the first upcoming occurrence after today, looking past the week if necessary, or null. The widget uses it for "Next: …" when `today` is empty.
  - `due_total_cents` and `due_total_display`: the sum of the week list occurrences that are not paid.
  - `data_as_of` and `stale`: the same values the Spending allowance uses.
- The Bills view does not depend on a Budget. It is present in the no-Budget state.

### API contract

- `GET /api/spending-allowance` returns a `bills` block next to `spending_allowance`. The phone keeps one fetch, one cache and one refresh worker.
- The contract fixtures (`ok`, `over`, `no_budget`, `stale`) gain the `bills` block. Add one fixture where no Bill is due today and `next_upcoming` is set. Regenerate with `UPDATE_CONTRACTS=1 pnpm test`.
- The app must accept a response without a `bills` block, so that a new APK works with an older server.
- The tailnet route `/widget/summary` does not change.

### MCP tools

- `list_bills`: lists active Bills (and ended Bills when asked). Each Bill has `missed_due_dates`: its missed due dates in a Period (default: the current Period), from the day the Bill was created.
- `list_bill_candidates`: lists the current Bill candidates with the proposed name, cadence, anchor, amount mode, amount, matcher rule and the debits that support it.
- `manage_bills` with actions:
  - `confirm`: create a Bill from a candidate, with optional changes to name, cadence, anchor and amount.
  - `create`: create a Bill by hand, for quarterly or yearly Bills that detection cannot see.
  - `edit`: change an active Bill.
  - `decline`: record a declined Bill candidate.
  - `end`: set a Bill to ended, with an end date.
- `get_upcoming_bills`: returns the same Bills view as the API.
- The `review_spending` Workflow guide gains steps. Call `list_bills` to find missed Bill occurrences in the Period, then ask whether to end each one. Call `get_upcoming_bills` to point out overdue ones. Call `list_bill_candidates` and confirm or decline each candidate with the Member.

### App

- The app does no money math (ADR-0003). It shows `amount_display` and `due_total_display` as given. It does not filter or sort occurrences. The only change the app makes is cutting the widget list to 3 rows plus "+N more".
- The in-app screen shows a "Bills this week" card below the breakdown card. The header shows `due_total_display`. Each row shows the weekday, the name and the amount, with a tick for paid and a warning colour for overdue. If `occurrences` is empty, the card shows "No bills this week".
- A new Glance widget, "Bills today", has its own receiver and widget info. It reads the same cached snapshot as the Spending widget. A change to the snapshot updates both widgets. A tap opens the app.
- "Bills today" states:

| State | Widget |
|---|---|
| `today` has rows | Up to 3 rows (tick for paid, warning colour for overdue), then "+N more" |
| `today` is empty, `next_upcoming` set | "No bills today" and "Next: <name> · <weekday> · <amount>" |
| `today` is empty, `next_upcoming` null | "No bills today" |
| stale | Rows greyed, as the Spending widget greys its number |
| response has no `bills` block | "Open the app to load bills" |
| signed out / nothing cached | Same as the Spending widget in that state |

## Testing Decisions

- A good test checks external behaviour through a seam. It does not check private functions or table layout.
- **Server, Seam 1** (an in-memory database, a fixed clock, a fake Akahu sync, then MCP tool calls, as in the Spending allowance tests):
  - Detection: monthly, weekly and fortnightly patterns; the AIA amount split; "AP#..." descriptions with `LOAN` and `STANDING ORDER` types; Internal transfers and one-offs excluded; stopped patterns excluded; declined and covered patterns excluded.
  - Confirm, create, edit, decline and end, seen through `list_bills` and `list_bill_candidates`.
  - Occurrence dates: the 31st in a 30-day month, February, fortnightly and yearly anchors, and the Household time zone at midnight.
  - Matching: early and late debits inside the window; a debit outside the window; two Bills on one merchant; overlapping weekly windows.
  - States at each day offset; the week list rules; `today`; `next_upcoming` beyond the week; the total excludes paid occurrences; median estimate; an ended Bill makes no occurrences.
- **Contract seam**: the fixture test generates the `bills` block from the real route in every state, plus the new "no Bills today" fixture. The Android contract test parses all fixtures.
- **App (JVM)**: pure functions map a cached response to the card model and the widget model. Test every row of the widget state table, the "+N more" cut, and a response without `bills`.
- **Manual**: check both phones against `get_upcoming_bills` on a day when a Bill is due, and on the morning after.

## Out of Scope

- Links from Bills to Envelopes or Budget Categories (for example, Committed allocations suggested from Bills).
- The source Account on each row.
- Fetching Akahu pending transactions, and syncing more than once a night.
- Editing Bills in the app. The app stays read-only.
- Notifications for due or overdue Bills.
- One-off dated payments.
- Any change to the Spending allowance figure.

## Further Notes

- Because of the nightly sync, a Bill debited today shows as "due" all day and turns "paid" the next morning. This is expected behaviour, not a bug.
- In the grilling, the week total covered "upcoming and due" occurrences, and overdue was not discussed. This spec counts every occurrence that is not paid, so overdue Bills are in the total, because their money has not left yet. Confirm this in review.
- The local `data/budget.sqlite` is stale (last sync 22 Jul 2026, 8 of 10 migrations). Check detection against the Pi data.
- Rollout order:
  1. Deploy the server to the Pi.
  2. Run a Claude session to confirm the first Bill candidates.
  3. Install the APK on both phones, then add the "Bills today" widget.
- Known Bills in history: AIA ×2 (26th), AIA GoCardless (28th–29th), IAG (26th, varies), Southern Cross Pet Insurance (7th), Watercare (~20th–22nd, varies), mortgage APs ×2 (`LOAN`, 26th), education AP (`STANDING ORDER`, weekly on Sunday), and card subscriptions (Google, Disney, Spotify, Netflix, 1Password, Mighty Mobile, 2degrees). Anytime Fitness ended on 3 Sep 2026.

# Spec: Internal transfers and refunds are neither Income nor spend

Status: ready-for-agent

_Builds on the shipped Income Streams work. Vocabulary follows `CONTEXT.md` (Account, Transaction, Income, Income Stream, Unclassified income, Income Rule, Budget Category, Spending allowance, Savings Account). The governing decision is ADR-0012, which refines ADR-0009. Read ADR-0012, ADR-0009 and ADR-0011 first._

## Problem Statement

ADR-0009's fallback treats every positive, non-`TRANSFER` credit as Unclassified income. Two kinds of credit pass that test but are not Income:

1. **Card repayments.** A repayment from BILLS to the Zero Visa is a `TRANSFER` on the BILLS side but a `CREDIT` on the card side. The card side counts as Income. In the local DB this is about $49k since Oct 2024, and $500–$1,000 in each recent Period.
2. **Refunds.** A merchant refund is a `CREDIT`, so it counts as Income. The original purchase stays in `spent`, and the Spending allowance never recovers.
3. **Savings moves.** An automatic payment to SAVINGS is a `STANDING ORDER` on BILLS and a `CREDIT` on SAVINGS, so the BILLS leg counts as spend. A manual withdrawal from SAVINGS is a `TRANSFER` on both legs, so it is skipped. In the 2026-10 Period, a $1,800 deposit and $1,040 of withdrawals showed as $1,800 Savings spend and an $800 Committed overspend. The Spending allowance read −$875.72 instead of about −$75.72.

As a result, actual Income is overstated, monthly reports show too much money in, and spending looks higher than it is.

A naive fix ("credits on a card are never Income") makes things worse. A repayment that is neither Income nor a `TRANSFER` falls into spend as a negative amount in Uncategorized. Under ADR-0011, that raises the Spending allowance by the size of every repayment.

## Solution

Classify every Transaction into one of three roles before Income and spend are computed:

- **Internal transfer:** money moving between two of the Household's own Accounts. It is neither Income nor spend. The server detects it by **pairing** a debit on one Account with an equal credit on another Account.
- **Refund:** a credit that reverses an earlier purchase. It is not Income. It goes into the purchase's Budget Category and reduces `spent` there. The server detects it by matching the credit's description to a recent debit with the same description.
- **Everything else** follows ADR-0009 unchanged: Income Rules, then the Unclassified income fallback.

A **Savings Account** is an Account the Household links to one Budget Category. The leg of an Internal transfer on a Savings Account counts as signed spend in that Budget Category. A deposit adds to `spent`, and a withdrawal reduces it. The Savings Envelope then shows net money saved.

A Member can override any of these on one Transaction.

Evidence from the local DB (read-only):
- 40 of 40 card repayments since BILLS history starts (22 Jun 2025) pair with a BILLS `TRANSFER` on the same day. The 19 repayments that do not pair are all before BILLS history starts.
- All SAVINGS transfers out pair. 44 of 46 BILLS transfers out pair.
- 17 of the remaining credits match a recent debit with the same description: PAK'nSAVE, IKEA, Kmart, Google One, My Food Bag, Basic Rentals, Saben, Zara, JD Sports, AS Colour, Spotlight, RV Super Centre, and a pharmacy.
- The rest are gifts, reimbursements (THL), and friends paying back. They stay as Unclassified income for a Member to review.

Evidence from the Pi (read-only, 4 Nov 2026, Period 2026-10):
- 16 Oct: BILLS −$1,800 `STANDING ORDER` "AP#26957006 TO B L FOSTER, A VAN DEN HEEVER" and SAVINGS +$1,800 `CREDIT` "Automatic Payment A VAN DEN HEEVER B". Neither leg is `TRANSFER`.
- 29 Oct, 30 Oct, 3 Nov: SAVINGS −$400, −$400, −$240 and BILLS +$400, +$400, +$240. All six legs are `TRANSFER`.
- Expected after this spec: Savings Envelope `spent` $760, remaining $240, Committed overspend $5.09 (Bank Fees only), Spending allowance about −$75.72.

## User Stories

1. As a Member, I want a card repayment not counted as Income, so that actual Income shows only real money in.
2. As a Member, I want a card repayment not counted as spend, so that paying off the card does not change the Spending allowance.
3. As a Member, I want money moved between our own Accounts recognised automatically, so that I do not maintain rules for every transfer.
4. As a Member, I want both legs of a transfer between our own Accounts treated the same way, so that the two sides never disagree.
5. As a Member, I want transfers between Accounts held by different Members recognised too, so that moving money to my partner's Account is not Income or spend.
6. As a Member, I want each debit paired with at most one credit, so that two equal transfers on the same day are not counted twice.
7. As a Member, I want the closest-date candidate chosen when several match, so that pairing is predictable.
8. As a Member, I want pairing to require at least one leg typed `TRANSFER` by Akahu, so that a salary that happens to equal a purchase is not paired by accident.
9. As a Member, I want pairing to rerun on stored data on every categorization pass, so that connecting another Account later fixes older Transactions without a re-fetch.
10. As a Member, I want a refund recognised automatically when its description matches a recent purchase, so that the refund reduces spend in the right Budget Category.
11. As a Member, I want a refund to raise the Spending allowance, so that returning something gives me the money back in the budget.
12. As a Member, I want a refund not counted as Income, so that Income stays accurate.
13. As a Member, I want Income Rules to win over refund matching, so that a credit I have deliberately classified stays in its Income Stream.
14. As a Member, I want to mark a single Transaction as an internal transfer, so that I can fix a transfer that cannot pair (e.g. before the other Account's history starts).
15. As a Member, I want to mark several Transactions as internal transfers at once, so that I can fix the 19 early repayments in one step.
16. As a Member, I want to unmark a wrongly paired Transaction, so that I can correct a false pair.
17. As a Member, I want my overrides kept when classification reruns, so that a correction stays corrected.
18. As a Member, I want the unclassified-income review list to show which credits are paired or treated as refunds, so that I can check the automatic results.
19. As a Member, I want the review list to show only credits that are still Unclassified income by default, so that it is shorter after this change.
20. As a Member, I want `get_budget`, `get_period_summary`, and the Spending allowance to reflect the new roles with no other change, so that existing tools keep their contracts.
21. As a Member, I want each override write audited and refused in read-only mode, so that it behaves like every other write.
22. As a Member, I want an automatic payment to savings recognised as an Internal transfer, so that it is paired like a manual transfer.
23. As a Member, I want to link our savings Account to the Savings Budget Category, so that the Savings Envelope shows net money saved.
24. As a Member, I want a withdrawal from savings to reduce the Savings Envelope's `spent`, so that drawing on savings shows as less saved, not as spend elsewhere.
25. As a Member, I want the part of the Savings target not yet moved to stay out of the Spending allowance, so that I do not spend money I plan to save.
26. As a Member, I want interest on the savings Account to stay Income, so that only my own transfers move the Savings Envelope.
27. As a Member, I want a summary after the first run (how many pairs, refunds, and remaining Unclassified credits), so that I can see the effect before trusting the numbers.

## Implementation Decisions

### Classification order

For every Transaction, in the existing categorization pass (so sync → classify stays one automatic pass):

1. **Member override** wins: a manual internal-transfer mark or unmark, a `classify_income` one-off, or a category override.
2. **Pairing** marks internal transfers (rules below). A paired Transaction is not Income and is not spend.
3. For an unpaired positive credit:
   1. An **Income Rule** match puts it in that Income Stream.
   2. Otherwise, a **refund match** makes it not Income and puts it in the matched debit's Budget Category.
   3. Otherwise, the ADR-0009 fallback applies unchanged: if the type is not `TRANSFER`, it becomes Unclassified income; else it is not Income.

Pairing runs before Income Rules. Money moving between the Household's own Accounts is never Income, even if a rule would match it. Otherwise the same pay would count twice once both Accounts are connected.

### Pairing rules

- Candidates: a debit and a credit with exactly opposite amounts, on two different Accounts in the Household (any Member).
- Dates within 3 days of each other. All pairs in the local DB are on the same day, so 3 days leaves a margin for bank posting delays.
- At least one leg must have Akahu type `TRANSFER` or `STANDING ORDER`. Akahu types an automatic payment to savings as `STANDING ORDER` on the paying Account and `CREDIT` on the receiving Account.
- Each Transaction belongs to at most one pair. Assign by the closest date first, then the lowest id.
- Pairs are derived from stored data on every pass, like income classification. Store them for reads. Do not treat them as a source of truth.

### Refund matching

- A positive credit with the same description as a debit dated 0–120 days earlier, on any Household Account.
- If several debits match, use the most recent one. The credit takes that debit's Budget Category.
- The credit is not Income. It reduces `spent` through the existing spend sum: non-Income, non-`TRANSFER`, signed amounts. The spend formula needs no change for refunds.
- Use an exact description match. Akahu gives credits no merchant or category group, so description is the only signal.

### Spend formula

- Exclude paired internal transfers from spend, in addition to the existing exclusion of `TRANSFER`-type rows. This removes the card-side `CREDIT` leg of a repayment.
- Keep the existing exclusion of unpaired `TRANSFER`-type rows. Changing it is outside this spec.
- Exception: the leg of a pair on a Savings Account counts as spend in the Account's linked Budget Category, with its signed amount. A deposit (credit) adds to `spent`. A withdrawal (debit) reduces `spent`. The other leg stays excluded.
- The linked Budget Category wins over the Transaction's own category and over a category override. A Member who does not want a leg counted forbids the pair with `mark_internal_transfer(false)`.
- The leg counts in the Period of its own date.
- Interest, withholding tax and other unpaired rows on a Savings Account follow the normal rules. Interest stays Income.
- The Spending allowance formula (ADR-0011) does not change. A Committed Savings Envelope withholds its unspent allocation and subtracts only overspend.

### Schema

- `transactions` gains a nullable self-reference to its pair, plus a nullable override marking the Transaction as internal transfer or not.
- `accounts` gains a nullable link to one Budget Category. A non-null link makes the Account a Savings Account. More than one Account can link to the same Budget Category.
- Refunds need no new column. They are non-Income rows with a Budget Category, like any categorized row. Record the refund source (the matched debit) only if it is cheap. It is useful for review but not required.

### Tools

- New: `mark_internal_transfer(transaction_ids[], internal: true | false | null)`. `true` forces an internal transfer, `false` forbids pairing, and `null` clears the override. Audited and refused in read-only mode.
- New: `set_savings_account(account_id, budget_category_id | null)`. A Budget Category id links the Account. `null` removes the link. The Uncategorized system category is refused. Audited and refused in read-only mode.
- `list_accounts` shows each Account's linked Budget Category, or null.
- `list_unclassified_income`: by default, list only credits that are still Unclassified income. Add an option to include paired and refund credits with their role, for review.
- A one-off summary after rollout: count of pairs, refunds, and the remaining Unclassified credits. Return it from the first backfill run or from a review tool. The implementer chooses.

### Docs

- ADR-0012 records this decision.
- **Internal transfer**, **Refund** and **Savings Account** are defined in `CONTEXT.md`.
- Update the `create_budget` and `review_spending` Workflow guides. Tell the assistant that the Savings Envelope shows net money saved, and that it must not move savings legs between Budget Categories.
- When this ships, remove the refund gap from ADR-0011's Consequences and from the Spending allowance spec's Out of Scope.

## Testing Decisions

- Test external behaviour through Seam 1: seed several Accounts through the fake Akahu client, sync, run categorization, and assert on tool outputs (`get_budget` income and envelopes, `get_period_summary`, `list_unclassified_income`). Do not assert on pairing internals or columns. Prior art: the ticket 10 income-classification tests and the ticket 11 income-tool tests.
- Cases:
  - A repayment (BILLS `TRANSFER` out, card `CREDIT` in, same day): neither Income nor spend; the Spending allowance is unchanged.
  - A savings transfer with both legs `TRANSFER`, SAVINGS not linked: unchanged behaviour.
  - Two equal transfers on the same day: two distinct pairs, no double use.
  - A salary credit equal to an unrelated card purchase, with neither leg `TRANSFER`: not paired, still Income.
  - A credit with no counterpart (before the other Account's history): falls back as today.
  - Connecting the second Account later: re-derivation pairs the old credit.
  - A refund matching a debit 30 days earlier: reduces `spent` in that category, is not Income, raises the Spending allowance.
  - A refund matching a debit 200 days earlier: not matched, falls back as today.
  - An Income Rule that matches a credit with a refund twin: the Income Rule wins.
  - An Income Rule that matches a paired credit: pairing wins.
  - `mark_internal_transfer` true, false, and null; the override survives a re-categorization; audited; refused in read-only mode.
  - `list_unclassified_income` default and review modes.
  - An automatic payment (`STANDING ORDER` out, `CREDIT` in, same day) between two Household Accounts: paired.
  - The 2026-10 case: SAVINGS linked to Savings ($1,000 allocated, Committed). A $1,800 deposit and $400 + $400 + $240 withdrawals give Savings `spent` $760, remaining $240, and no Committed overspend from Savings. Income does not change.
  - A deposit of $1,800 with no withdrawals: Savings overspend of $800 lowers the Spending allowance by $800.
  - Withdrawals greater than deposits: Savings `spent` is negative, and the Spending allowance does not rise.
  - A withdrawal of $400 and a $400 Transport purchase: Savings `spent` falls by $400, Transport `spent` rises by $400 once.
  - Interest credited to a Savings Account: Income, not Savings `spent`.
  - A transfer between BILLS and the card (neither linked): no spend, as before.
  - A savings leg with a category override to another Budget Category: still counts in the linked Budget Category.
  - `set_savings_account` link, unlink, Uncategorized refused, audited, refused in read-only mode.

## Out of Scope

- Unpaired `TRANSFER`-type debits to people outside the Household (currently excluded from spend). Review this separately.
- Fuzzy description matching for refunds, or amount-based refund matching.
- Classifying gifts, reimbursements, and friends paying back. These stay as Unclassified income for a Member to classify with existing tools.
- Pending Transactions.
- Savings goals separate from Envelopes, planned replenishment transfers, and cash-flow forecasts. A Committed Savings Envelope with net `spent` covers the 2026-10 case. Forecasting stays post-V1 (ADR-0004).
- An "expense funded from savings" link between a withdrawal and a purchase.

## Further Notes

- After deploy, the 19 unpaired repayments from before 22 Jun 2025 need `mark_internal_transfer`. They fall in Periods with no Budget, so only historical reports are affected.
- After deploy, link SAVINGS to the Savings Budget Category with `set_savings_account`. Until then, savings legs are excluded like any other pair, and the Savings Envelope shows $0 spent.
- The "Transfers" Budget Category held transfer legs as a workaround. After rollout, check whether it still holds any spend, then merge or retire it.
- The local DB is stale (last sync 22 Jul 2026). Rerun the evidence queries against the Pi before the rollout.
- Spending allowance interaction (ADR-0011): after this ships, a refund raises the allowance, and a card repayment no longer touches Income or spend.

# Budget AI App

A household budgeting assistant backed by real bank data (via Akahu) and driven through conversational AI. It lets a household create monthly budgets, categorize and track spending, decide whether a purchase fits, and generate reports — with all financial math computed server-side and the AI supplying judgment.

## Language

### Household & identity

**Household**:
The top-level scope. Budgets belong to the Household and are shared across its Members. There is exactly one Household per deployment.
_Avoid_: Family, group, tenant, organization

**Member**:
A person in the Household (e.g. the two partners). A Member may hold more than one Connection.
_Avoid_: User, account, profile

**Connection**:
One Member's Akahu Personal App credential pair (`app_token` + `user_token`), granting read access to that Member's bank accounts.
_Avoid_: Login, integration, credential, token (bare)

### Money in

**Account**:
A bank account surfaced through a Connection. Belongs to a Member and rolls up to the Household.
_Avoid_: Wallet, bank (as a noun for the account)

**Transaction**:
A single debit or credit on an Account, sourced from Akahu and cached in sqlite.
_Avoid_: Entry, line item, payment

**Income**:
Household-level money in for a Period. **Expected income** is a figure the Household sets; **actual income** is the sum of credit Transactions classified into an Income Stream in the Period.
_Avoid_: Salary, earnings, revenue

**Income Stream**:
A household-defined source of Income (e.g. "Salary", "PPL"). A credit Transaction is Income if and only if it is classified into an Income Stream; the classification is driven by Income Rules over the same matcher used for Budget Categories. Income Streams give the per-source breakdown a Household needs to see (e.g. which stream ends when).
_Avoid_: Income category, income type, income bucket

**Unclassified income**:
The system Income Stream that positive, non-transfer credits fall into when no Income Rule names them. It keeps actual-income totals whole while flagging credits that still need a real Stream — the counterpart to Uncategorized on the expense side.
_Avoid_: Other income, misc income

**Income Rule**:
Data in sqlite routing a merchant, description, Akahu group, or Akahu `type` to an Income Stream — the income-side twin of a Mapping Rule, sharing the same matcher. Lets a credit that Akahu never tags as income (e.g. a partner's pay arriving as a bank transfer) be promoted to an Income Stream.
_Avoid_: Classifier, rule (bare)

**Internal transfer**:
Money moving between two of the Household's own Accounts (e.g. a card repayment, a move to savings), recognised by pairing the debit on one Account with the matching credit on the other. Neither Income nor spend.
_Avoid_: Transfer (bare — Akahu's `TRANSFER` type is a different, narrower thing), movement, repayment

**Refund**:
A credit that reverses an earlier purchase. Not Income; it belongs to the purchase's Budget Category and reduces what was spent there.
_Avoid_: Credit (bare), reversal, return

### Categorization

**Akahu Category**:
Akahu's NZFCC-based tag on a Transaction (exposed via its `personal_finance` group). An input to categorization, never a budgeting unit itself.
_Avoid_: Category (bare — always qualify)

**Budget Category**:
A household-defined envelope label (e.g. "Groceries", "Date nights"). The unit budgets are built from.
_Avoid_: Bucket, tag, class, category (bare)

**Mapping Rule**:
Data in sqlite routing an Akahu Category or a merchant to a Budget Category. Seeded from `personal_finance` groups, then AI-refined.
_Avoid_: Classifier, rule (bare)

**Uncategorized**:
The catch-all Budget Category for Transactions no Mapping Rule covers. Guarantees totals always reconcile.
_Avoid_: Other, misc, unknown

### The budget

**Period**:
A calendar month, stored as an explicit start/end date range. Governed by `budget_month_start_day` (default 1) so pay-cycle periods are a later config change, not a schema change. Dates are calendar dates in the Household time zone (`household_timezone`).
_Avoid_: Month (bare), cycle, term

**Budget**:
The set of Envelopes for a Household in a given Period.
_Avoid_: Plan, allocation set

**Envelope**:
A Budget Category's dollar allocation for a Period, tracked as `allocated / spent / remaining`.
_Avoid_: Line, allotment, fund

**Slack**:
An Envelope's unspent room this Period (`allocated − spent`). The basis for reallocation suggestions.
_Avoid_: Surplus, headroom (headroom is reserved — see below), leftover

**Household headroom**:
Money not yet assigned to any Envelope this Period (`income − total allocated`).
_Avoid_: Slack (slack is per-Envelope), surplus

**Committed**:
A Budget Category whose money is already spoken for — recurring payments, insurance, savings, debt repayment, sinking funds. Its unspent allocation is never treated as spendable.
_Avoid_: Fixed, essential, recurring

**Flexible**:
A Budget Category for variable, chosen spending (e.g. groceries, cafés, clothes). Every Budget Category is either Committed or Flexible.
_Avoid_: Discretionary, variable, non-essential

**Spending allowance**:
The Household's Flexible money left this Period: Flexible Envelopes' remaining, less any Committed overspend and Uncategorized spend. A derived figure, never stored.
_Avoid_: Safe to spend, flexible spend, budget left, Slack, headroom

**Reallocate**:
Moving allocation from one Envelope to another — the explicit write a user confirms after a purchase decision.
_Avoid_: Transfer (implies moving real money, which this system never does), rebalance

### Purchases & planning

**Planned Purchase**:
A persisted intended expense — `{description, amount, target_category, target_period, priority, status}`. A list entry, **not** a reservation against an Envelope.
_Avoid_: Reservation, earmark, wishlist item, goal

**Evaluate purchase**:
The read-only analysis of whether one purchase fits, returning structured facts (target Envelope remaining, verdict, reallocatable Slack, Household headroom, days left). Advisory only — changes nothing.
_Avoid_: Approve, authorize

**Bill**:
A repeating, expected Household debit that counts as spend, due on a known date at a known or estimated amount. Never an Internal transfer (a card repayment or a move to savings is not a Bill); a one-off dated expense is not a Bill.
_Avoid_: Payment, direct debit, subscription (bare — a subscription is one kind of Bill), recurring

**Bill occurrence**:
One dated instance of a Bill (e.g. Power, due 22 Oct, ~$212). A Bill repeats; a Bill occurrence happens once. Its state is **upcoming** (due date ahead), **due** (due today or just past, debit not yet seen), **paid** (a debit matched it), **overdue** (several days past, no debit), or **missed** (past the overdue window; a hint the Bill has ended).
_Avoid_: Bill due, instalment, payment

**Bill candidate**:
A repeating debit pattern the system has spotted in Transaction history but no Member has confirmed. Becomes a Bill only when a Member confirms it; never shown as an upcoming Bill.
_Avoid_: Suggested bill, detected bill, draft bill

**Plan period**:
The read-only collective analysis of all Planned Purchases for a Period, greedily testing what fits by priority.
_Avoid_: Forecast, schedule

### System

**Data-as-of**:
The freshness timestamp attached to every read, reflecting the last successful Akahu sync.
_Avoid_: Last updated, synced at

**Workflow guide**:
Server-side step-by-step guidance for a flow (`create_budget`, `review_spending`, `plan_purchase`, `monthly_report`), fetched identically by Claude skills and the ChatGPT custom GPT.
_Avoid_: Playbook, script, prompt (bare)

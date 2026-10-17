# Internal transfers are paired, and refunds net against spend

Before Income Rules or the ADR-0009 fallback run, the classification pass gives each Transaction one of two extra roles. An **Internal transfer** is money moving between two of the Household's own Accounts, detected by **pairing** a debit with an equal and opposite credit on another Account; it is neither Income nor spend. A **Refund** is a credit whose description exactly matches a debit from the previous 120 days; it is not Income, takes that debit's Budget Category, and reduces `spent` there. This refines ADR-0009, whose positive-non-`TRANSFER` fallback counted both as Unclassified income: card repayments (a `TRANSFER` on the bank side but a `CREDIT` on the card side) overstated Income by $500–$1,000 a Period, and refunds never came back off spend, so the Spending allowance (ADR-0011) never recovered.

## Considered Options

- **"Credits on a credit card are never Income"** — rejected: a repayment that is neither Income nor a `TRANSFER` falls into the spend sum as negative Uncategorized spend, which under ADR-0011 *raises* the Spending allowance by every repayment. Fixing Income this way breaks spend.
- **Transfer rules** (description → internal transfer, like Income Rules) as the primary mechanism — rejected: every new transfer pattern ("oct", "July repay", "credit-card top-up") needs a rule. Pairing needs none and covers transfers between any two Household Accounts. A manual per-Transaction override covers what pairing can't see.
- **Pair after Income Rules** — rejected: once both Accounts are connected, pay that arrives in one Account and moves to another would count as Income twice. Money between the Household's own Accounts is never Income, so pairing runs first.
- **Pair on amount and date alone** — rejected: a salary credit could pair with an unrelated purchase of the same amount. At least one leg must be typed `TRANSFER` by Akahu.
- **Refund matching by merchant or Akahu category** — not possible: Akahu attaches neither to credits. An exact description match against a recent debit is the only signal available. Fuzzy matching is deferred.

## Consequences

- Pairing rules: exactly opposite amounts, two different Household Accounts (any Member), dates within 3 days, at least one `TRANSFER` leg. Each Transaction is in at most one pair; the closest date wins, then the lowest id.
- Pairs and refund matches are re-derived from stored data on every categorization pass, so connecting another Account later fixes older Transactions without a re-fetch. A Member override (mark as, or forbid as, internal transfer) survives re-derivation.
- Order of precedence: Member override > pairing > Income Rule > refund match > ADR-0009 fallback.
- The spend sum also excludes paired internal transfers. Refunds need no formula change: they are non-Income signed rows in a Budget Category.
- Transfers that cannot pair because the other Account's history starts later (19 early card repayments in the local DB) need a manual override.
- Unpaired `TRANSFER`-type debits stay excluded from spend, as before. Whether a transfer to someone outside the Household is spend is a separate, unmade decision.
- Gifts, reimbursements and friends paying back are neither pairs nor refunds; they stay as Unclassified income for a Member to classify.

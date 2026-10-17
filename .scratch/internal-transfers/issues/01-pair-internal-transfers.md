# 01: Pair Internal transfers

**What to build:** Money moving between two of the Household's own Accounts is recognised automatically and counted as neither Income nor spend. A card repayment no longer inflates actual Income, and it does not change the Spending allowance (ADR-0012).

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

Spec: `.scratch/internal-transfers/spec.md` (Classification order, Pairing rules, Spend formula)

- [ ] The categorization pass pairs a debit and a credit with exactly opposite amounts, on two different Household Accounts (any Member), within 3 days, with at least one leg typed `TRANSFER`
- [ ] Each Transaction is in at most one pair; the closest date wins, then the lowest id
- [ ] Pairing runs before Income Rules; a paired credit is never Income, even when an Income Rule matches it
- [ ] The spend sum excludes paired Transactions, in addition to the existing `TRANSFER` exclusion
- [ ] Pairs are re-derived from stored data on every pass; connecting a second Account later pairs older Transactions
- [ ] A salary credit equal to an unrelated purchase, with no `TRANSFER` leg, is not paired
- [ ] An unpaired credit falls back exactly as before
- [ ] Seam 1 tests drive these cases through sync, categorization, and `get_budget`

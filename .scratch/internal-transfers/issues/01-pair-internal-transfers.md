# 01: Pair Internal transfers

**What to build:** Money moving between two of the Household's own Accounts is recognised automatically and counted as neither Income nor spend. A card repayment no longer inflates actual Income, and it does not change the Spending allowance (ADR-0012).

**Blocked by:** None (can start immediately)

**Status:** done

Spec: `.scratch/internal-transfers/spec.md` (Classification order, Pairing rules, Spend formula)

- [x] The categorization pass pairs a debit and a credit with exactly opposite amounts, on two different Household Accounts (any Member), within 3 days, with at least one leg typed `TRANSFER` or `STANDING ORDER`
- [x] Each Transaction is in at most one pair; the closest date wins, then the lowest id
- [x] Pairing runs before Income Rules; a paired credit is never Income, even when an Income Rule matches it
- [x] The spend sum excludes paired Transactions, in addition to the existing `TRANSFER` exclusion
- [x] Pairs are re-derived from stored data on every pass; connecting a second Account later pairs older Transactions
- [x] An automatic payment (`STANDING ORDER` out, `CREDIT` in) between two Household Accounts is paired
- [x] A salary credit equal to an unrelated purchase, with no `TRANSFER` or `STANDING ORDER` leg, is not paired
- [x] An unpaired credit falls back exactly as before
- [x] Seam 1 tests drive these cases through sync, categorization, and `get_budget`

**Notes (4 Nov 2026):** Local DB check: all 24 card repayments since 22 Jun 2025 pair; the 19 earlier ones do not (ticket 02 fixes them by hand). Two card debits pair with `TRF 4327…` credits on BILLS; these are real moves from the card to BILLS. Test 18 now seeds its pre-0009 schema with raw SQL, because the sync writes the new `transfer_pair_id` column.

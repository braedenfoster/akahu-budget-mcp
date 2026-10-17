# 03: Refunds net against spend

**What to build:** A merchant Refund comes back off spend in the purchase's Budget Category instead of counting as Income. Returning something raises the Spending allowance (ADR-0012).

**Blocked by:** 01 (Pair Internal transfers)

**Status:** ready-for-agent

Spec: `.scratch/internal-transfers/spec.md` (Refund matching)

- [ ] An unpaired positive credit with exactly the same description as a debit dated 0–120 days earlier, on any Household Account, is a Refund
- [ ] When several debits match, the most recent one wins; the Refund takes that debit's Budget Category
- [ ] A Refund is not Income and reduces `spent` in its Budget Category
- [ ] An Income Rule match wins over a refund match
- [ ] A credit matching only a debit older than 120 days falls back as before
- [ ] Remove the refund gap from ADR-0011's Consequences and from the Spending allowance spec's Out of Scope
- [ ] Seam 1 tests cover the criteria above, including the effect on the Spending allowance if it has shipped

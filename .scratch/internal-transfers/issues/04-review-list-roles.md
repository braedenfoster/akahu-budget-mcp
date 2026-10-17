# 04: Review list shows transfer and refund roles

**What to build:** After pairing and refund matching, a Member can review what is still Unclassified income, and can inspect what the automatic rules decided before trusting the numbers.

**Blocked by:** 01 (Pair Internal transfers), 03 (Refunds net against spend)

**Status:** ready-for-agent

Spec: `.scratch/internal-transfers/spec.md` (Tools)

- [ ] `list_unclassified_income` lists only credits still in Unclassified income by default
- [ ] A review option includes paired and Refund credits, each with its role and (for a Refund) its Budget Category
- [ ] A summary reports the count of pairs, Refunds, and remaining Unclassified credits (from a backfill run or a review tool; the implementer chooses)
- [ ] Seam 1 tests cover the default and review modes and the summary

# 05: Rollout on the Pi

**What to build:** The live data on the Pi is checked against the automatic results, and the transfers pairing cannot see are fixed by hand.

**Blocked by:** 01, 02, 03, 04, 06 (all deployed to the Pi)

**Status:** ready-for-human

Spec: `.scratch/internal-transfers/spec.md` (Further Notes)

- [ ] Rerun the spec's evidence queries against live data and compare with the summary
- [ ] Mark the early card repayments (before BILLS history starts) as Internal transfers
- [ ] Review the remaining Unclassified income and classify gifts, reimbursements, and repayments from friends with the existing tools
- [ ] Check `income.actual` for recent Periods no longer includes card repayments
- [x] Link SAVINGS to the Savings Budget Category with `set_savings_account`
- [x] Check Period 2026-10: Savings `spent` is $760 (or $1,000 if the $240 was moved back), and the Spending allowance has no Savings overspend
- [ ] Check whether the "Transfers" Budget Category still holds spend, then merge or retire it

**Notes (4 Nov 2026):** Tickets 01 and 06 deployed to the Pi on 4de1c3c. Backup taken first: `data/budget.sqlite.bak.pre-savings-accounts-20261104`. `set_savings_account` linked SAVINGS to Savings (id 16) and moved 107 savings legs into Savings. Period 2026-10 on the live server: Savings spent $760, remaining $240, Spending allowance −$75.72 (was −$875.72), Income unchanged at $3,134.35. The widget shows −$75.72. Tickets 02–04 are not built yet, so the other checks stay open.

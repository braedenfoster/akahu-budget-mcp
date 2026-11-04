# 06: Savings Account counts net transfers toward its Envelope

**What to build:** A Member links the savings Account to the Savings Budget Category. Each Internal transfer into that Account adds to the Savings Envelope's `spent`, and each transfer out reduces it. The Envelope shows net money saved, and the Spending allowance no longer shows a false Savings overspend (ADR-0012).

**Blocked by:** 01 (Pair Internal transfers)

**Status:** done

Spec: `.scratch/internal-transfers/spec.md` (Spend formula, Schema, Tools)

- [x] `accounts` gains a nullable link to one Budget Category
- [x] New tool `set_savings_account(account_id, budget_category_id | null)` links and unlinks; it refuses Uncategorized, is audited, and is refused in read-only mode
- [x] `list_accounts` shows each Account's linked Budget Category
- [x] The leg of a pair on a Savings Account counts as signed spend in the linked Budget Category, in the Period of its own date; the other leg stays excluded
- [x] The linked Budget Category wins over the leg's own category and a category override
- [x] Interest and withholding tax on a Savings Account follow the normal rules
- [x] The 2026-10 case passes: $1,800 in, $1,040 out, $1,000 allocated gives Savings `spent` $760, remaining $240, no Savings overspend in the Spending allowance, and no change to Income
- [x] Withdrawals greater than deposits give negative Savings `spent` and do not raise the Spending allowance
- [x] The `create_budget` and `review_spending` Workflow guides say the Savings Envelope shows net money saved
- [x] Seam 1 tests cover the spec's Savings Account cases through sync, categorization, `get_budget`, and the Spending allowance

**Notes (4 Nov 2026):**
- Checked on a copy of the Pi DB, with SAVINGS linked to Savings: Period 2026-10 shows Savings spent $760, remaining $240, and a Spending allowance of −$75.72 (was −$875.72). Income is unchanged at $3,134.35.
- Bills now read `isPurchaseSql`, which excludes every Internal transfer. `isSpendSql` also counts savings legs, so a regular withdrawal would otherwise become a Bill candidate.
- Pairing prefers a pair with two transfer-typed legs. Without that, a $400 card purchase on the day of a $400 savings withdrawal took the BILLS credit.
- Found, not fixed: `manage_categories` merge fails with a foreign-key error when the source category has an Envelope. This is an older bug, outside this ticket.

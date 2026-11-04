# 06: Savings Account counts net transfers toward its Envelope

**What to build:** A Member links the savings Account to the Savings Budget Category. Each Internal transfer into that Account adds to the Savings Envelope's `spent`, and each transfer out reduces it. The Envelope shows net money saved, and the Spending allowance no longer shows a false Savings overspend (ADR-0012).

**Blocked by:** 01 (Pair Internal transfers)

**Status:** ready-for-agent

Spec: `.scratch/internal-transfers/spec.md` (Spend formula, Schema, Tools)

- [ ] `accounts` gains a nullable link to one Budget Category
- [ ] New tool `set_savings_account(account_id, budget_category_id | null)` links and unlinks; it refuses Uncategorized, is audited, and is refused in read-only mode
- [ ] `list_accounts` shows each Account's linked Budget Category
- [ ] The leg of a pair on a Savings Account counts as signed spend in the linked Budget Category, in the Period of its own date; the other leg stays excluded
- [ ] The linked Budget Category wins over the leg's own category and a category override
- [ ] Interest and withholding tax on a Savings Account follow the normal rules
- [ ] The 2026-10 case passes: $1,800 in, $1,040 out, $1,000 allocated gives Savings `spent` $760, remaining $240, no Savings overspend in the Spending allowance, and no change to Income
- [ ] Withdrawals greater than deposits give negative Savings `spent` and do not raise the Spending allowance
- [ ] The `create_budget` and `review_spending` Workflow guides say the Savings Envelope shows net money saved
- [ ] Seam 1 tests cover the spec's Savings Account cases through sync, categorization, `get_budget`, and the Spending allowance

---
name: review-spending
description: Review this period's spending, clear uncategorized transactions, and spot overspent envelopes.
---

# Review spending

Thin wrapper over the shared server-side guide — **no budgeting logic here**.

1. Call the `get_workflow_guide` MCP tool with `flow: "review_spending"`.
2. Follow the returned steps in order, calling the tools it names.
3. Only write (categorize a transaction, create a rule) when the user agrees;
   let the server compute all totals.

---
name: review-spending
description: Review this period's spending, clear uncategorized transactions, tidy how income classifies into Income Streams, and spot overspent envelopes.
---

# Review spending

Thin wrapper over the shared server-side guide — **no budgeting logic here**.

1. Call the `get_workflow_guide` MCP tool with `flow: "review_spending"`.
2. Follow the returned steps in order, calling the tools it names.
3. Only write when the user agrees — on the expense side (categorize a
   transaction, create a mapping rule) and the income side (classify a credit
   into an Income Stream, create an income rule, or manage Streams). Let the
   server compute all totals.

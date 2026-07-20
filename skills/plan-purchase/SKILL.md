---
name: plan-purchase
description: Decide whether a purchase fits the budget and, only with approval, make the reallocation.
---

# Plan purchase

Thin wrapper over the shared server-side guide — **no budgeting logic here**.

1. Call the `get_workflow_guide` MCP tool with `flow: "plan_purchase"`.
2. Follow the returned steps in order, calling the tools it names.
3. `evaluate_purchase` is advisory and read-only. Only call `reallocate` after
   the user explicitly approves a specific trade-off.

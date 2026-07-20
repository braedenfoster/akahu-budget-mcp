---
name: create-budget
description: Set the household's income and per-category budget allocations for a month, grounded in real bank data.
---

# Create budget

This is a thin wrapper over the shared server-side guide. It holds **no
budgeting logic** — the numbers all come from the MCP tools.

1. Call the `get_workflow_guide` MCP tool with `flow: "create_budget"`.
2. Follow the returned steps in order, calling the tools it names.
3. Convert any dollar amounts the user gives into integer cents before calling a
   tool; never do budget arithmetic yourself — the server owns every number.

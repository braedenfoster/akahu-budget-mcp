---
name: monthly-report
description: Produce a structured monthly budget report and answer follow-up questions conversationally.
---

# Monthly report

Thin wrapper over the shared server-side guide — **no budgeting logic here**.

1. Call the `get_workflow_guide` MCP tool with `flow: "monthly_report"`.
2. Follow the returned steps in order, calling the tools it names.
3. Present the figures from `get_period_summary` as returned; drill into detail
   with `list_transactions` / `search_transactions` on request.

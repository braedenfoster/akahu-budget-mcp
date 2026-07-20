# 09 — Workflow guides + get_workflow_guide + Claude skills

**What to build:** The four guided flows exist as server-side guides fetched via a `get_workflow_guide` tool, and the Claude Member gets four thin `/slash` skills that fetch and follow them — completing the Phase-1 end-to-end experience. Guidance lives server-side so it's the single source of truth for both front-ends (ADR-0006). See `CONTEXT.md` (Workflow guide).

**Blocked by:** 04, 05, 06, 07, 08.

**Status:** ready-for-agent

- [ ] `get_workflow_guide(flow)` returns step-by-step guidance for `create_budget`, `review_spending`, `plan_purchase`, and `monthly_report`, each orchestrating the relevant tools.
- [ ] Four thin Claude skills wrap the guides as `/slash` commands; they contain no budgeting logic — they fetch the guide and follow it.
- [ ] Each flow is walkable end-to-end against a seeded/real dataset: create a budget; clear Uncategorized + spot overspend; evaluate a purchase + weigh the wishlist; produce a monthly report.
- [ ] Confirm whether ChatGPT surfaces MCP prompts; since guidance is a **tool**, it works regardless (documented for Phase 2).
- [ ] Seam 1 test: `get_workflow_guide` returns a guide for each of the four flow names and errors cleanly on an unknown flow.

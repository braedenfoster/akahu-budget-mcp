# Budgeting Claude skills

Four thin `/slash` skills for the Claude Household Member. They contain **no
budgeting logic** — each simply fetches the matching server-side Workflow guide
via the `get_workflow_guide` MCP tool and follows its steps. The guidance lives
in the server (ADR-0006), so Claude and (Phase 2) ChatGPT walk identical flows.

| Skill | Flow | What it does |
|-------|------|--------------|
| `/create-budget`   | `create_budget`   | Set income + Envelope allocations for a Period |
| `/review-spending` | `review_spending` | Review spend, clear Uncategorized, spot overspend |
| `/plan-purchase`   | `plan_purchase`   | Decide whether a purchase fits; weigh the wishlist |
| `/monthly-report`  | `monthly_report`  | Produce a structured monthly report |

## Installing in Claude Desktop

1. Connect Claude Desktop to the MCP server (Phase 1: over Tailscale via an
   `mcp-remote` stdio→HTTP bridge to the Pi's MagicDNS name).
2. Copy each skill directory into your Claude skills location.
3. The skills fetch their guide at run time, so updating a guide server-side
   updates every front-end at once — never edit budgeting steps into a skill.

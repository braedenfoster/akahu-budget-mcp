# Server-side workflow guidance, shared across both front-ends

The guided flows (`create_budget`, `review_spending`, `plan_purchase`, `monthly_report`) live **in the server**, fetched via a `get_workflow_guide(flow)` tool. Claude skills and the ChatGPT custom GPT are **thin shims** that fetch and follow the same guide. This mirrors ADR-0003: as the numbers have one source of truth, so does the *process*.

## Considered Options

- **Duplicate the guidance** in a Claude skill and a ChatGPT GPT — rejected: two copies drift, and the household ends up budgeting two different ways.
- **MCP `prompts` primitive** — not chosen: ChatGPT Developer Mode's support centers on tools and may not surface MCP prompts, whereas a tool definitely works in both. (Verify before implementing; fall back to a tool if prompts aren't surfaced.)

## Consequences

- Claude skills exist purely as a nicer `/slash` UX over the shared guides; they are never the home of logic.
- Because Claude skills are Claude-only, putting guidance server-side is what gives the ChatGPT Member (Phase 2) an equivalent guided experience at all.

# Akahu budgeting MCP

Run your household budget as a conversation with an AI, grounded in real bank
data. A single MCP server (TypeScript) connects to [Akahu](https://akahu.nz)
(NZ open banking), caches Accounts and Transactions in local sqlite, and exposes
tools that compute **every budgeting number server-side** — so the AI supplies
judgment, never arithmetic (ADR-0003).

Read `CONTEXT.md` for the domain language and `docs/adr/` for the decisions.
This is the Phase 1 (Claude, private-over-Tailscale) V1; see `.scratch/` for the
spec and tickets. Phase 2 (public + OAuth + ChatGPT) is fenced off for later.

## Stack

Node 22+, `@modelcontextprotocol/sdk` over Streamable HTTP, better-sqlite3 +
Drizzle, `node-cron`, `zod`, `vitest`, pnpm (ADR-0008).

## Setup

```bash
pnpm install
cp .env.example .env    # fill in Akahu app_token + user_token pairs
pnpm build
pnpm start              # migrates on startup, then serves /mcp
```

Migrations apply automatically on startup; `pnpm db:migrate` runs them
standalone and `pnpm db:generate` regenerates them from the schema.

## Configuration

All config is environment (see `.env.example`): server host/port, `DATABASE_PATH`,
`READ_ONLY`, `HOME_CURRENCY`, `BUDGET_MONTH_START_DAY`, the nightly `SYNC_CRON`,
and one numbered `AKAHU_*_<n>` credential trio per Household Member's Connection.
Tokens live in memory only and are never logged or returned by any tool.

## Tools

Reads carry a `data_as_of` stamp; writes are audited and refused in read-only
mode. Accounts/Transactions: `list_accounts`, `list_transactions`,
`search_transactions`, `refresh`. Categorization: `list_categories`,
`list_uncategorized`, `manage_categories`, `categorize_transaction`,
`set_category_rule`. Budget: `get_budget`, `create_budget_for_period`,
`set_allocation`, `set_expected_income`, `reallocate`. Analysis:
`evaluate_purchase`, `plan_period`. Reports: `get_period_summary`. Planned
purchases: `add_planned_purchase`, `list_planned_purchases`,
`update_planned_purchase`, `mark_purchased`, `drop_planned_purchase`. Guidance:
`get_workflow_guide`. Plus `get_settings` / `set_setting`.

The four guided flows (`create_budget`, `review_spending`, `plan_purchase`,
`monthly_report`) live server-side and are fetched via `get_workflow_guide`; the
thin Claude skills in `skills/` wrap them as `/slash` commands (ADR-0006).

## Money

All amounts are integer minor units (cents) paired with an explicit currency.
The server owns all arithmetic; the AI never does money math (ADR-0003).

## Tests

```bash
pnpm test          # vitest, all Seam 1 + Seam 2 suites
pnpm typecheck
```

Two seams (spec: Testing Decisions): **Seam 1** — the MCP tool boundary (seed a
temp sqlite, invoke a tool, assert structured output); **Seam 2** — the Akahu
client port (inject recorded responses, assert idempotent sync). Tests never
touch live Akahu.

## Deployment

Self-hosted on a Raspberry Pi over Tailscale (ADR-0002). See
`deploy/akahu-budget-mcp.service` for the systemd unit.

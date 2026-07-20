# Spec: Akahu Budgeting MCP

Status: ready-for-agent

_Synthesized from the grill-with-docs session. Vocabulary follows `CONTEXT.md`; decisions follow ADR-0001 through ADR-0008. Read those first._

## Problem Statement

We (a two-person Household) want to run our shared monthly budget as a conversation with an AI, using our real bank data instead of a spreadsheet. We want to ask things like _"I want to buy X — how can we make it work in our budget?"_ and _"help me set a budget for this month"_, and get honest, numbers-accurate answers grounded in what's actually in our accounts. One partner works in Claude, the other in ChatGPT, and the budget must be the **same** for both of us. Today no tool does this: budgeting apps aren't conversational, and asking an AI directly means it hallucinates the maths.

## Solution

A single MCP server, self-hosted on a Raspberry Pi over Tailscale, that:

- Connects to Akahu (New Zealand open-banking) to pull Accounts and Transactions for each Household Member's Connection, caching everything in a local sqlite database.
- Exposes a set of MCP tools that compute **every budgeting number server-side** (spent, remaining, Slack, income, purchase verdicts) and return structured facts — so the AI supplies judgment, never arithmetic (ADR-0003).
- Models the budget as monthly calendar-month category Envelopes (ADR-0004), with a household-defined category taxonomy mapped from Akahu's categories (ADR-0007).
- Serves shared, server-side **Workflow guides** so Claude (via skills) and ChatGPT (via a custom GPT) walk identical guided flows (ADR-0006).

Phase 1 delivers this privately for the Claude Member over Tailscale (no OAuth). Phase 2 exposes the endpoint publicly (Tailscale Funnel) with OAuth to bring the ChatGPT Member online (ADR-0002).

## User Stories

### Setup & connections
1. As a Member, I want to register the Household and myself as a Member, so that budgets and data have an owner.
2. As a Member, I want to add an Akahu Connection (app_token + user_token) via configuration, so that my bank Accounts become available.
3. As a Member, I want the Household to support multiple Connections (mine and, later, my partner's), so that our combined Accounts roll up into one shared budget.
4. As a Member, I want my credentials read from `.env` and never logged or returned, so that my bank access stays secret.
5. As a Member, I want the server to run as a systemd service on the Pi and restart on crash, so that it's always available.

### Syncing & data freshness
6. As a Member, I want Accounts and Transactions synced from Akahu nightly, so that my data is fresh without me doing anything.
7. As a Member, I want to trigger an immediate `refresh`, so that I can check the latest before a decision.
8. As a Member, I want sync to be incremental and idempotent, so that re-syncing never double-counts spend.
9. As a Member, I want pending transactions to become settled without duplication, so that my numbers stay correct as transactions clear.
10. As a Member, I want a daily balance snapshot per Account captured automatically, so that future cashflow features have history.
11. As a Member, I want every data response to carry a `data-as-of` stamp, so that the AI can tell me how fresh the numbers are.
12. As a Member, I want history retained indefinitely on the Pi (beyond Akahu's ~90-day window), so that trend reports work.

### Accounts & transactions
13. As a Member, I want to list all Accounts across all Connections with balances, so that I can see our whole financial picture.
14. As a Member, I want to list Transactions filtered by Period, Budget Category, Account, Member, merchant, or amount, so that I can drill into spending.
15. As a Member, I want to search Transactions by text, so that I can find a specific purchase.

### Categorization
16. As a Member, I want each Transaction auto-assigned to a Budget Category via Mapping Rules seeded from Akahu's `personal_finance` groups, so that categorization works on day one.
17. As a Member, I want an explicit Uncategorized Budget Category, so that totals always reconcile.
18. As a Member, I want to list Uncategorized Transactions, so that I can clean them up.
19. As a Member, I want the AI to help me categorize what's Uncategorized, so that cleanup is fast.
20. As a Member, I want to assign a single Transaction to a Budget Category (one-off), so that I can fix an odd item.
21. As a Member, I want to create a Mapping Rule (merchant or Akahu Category → Budget Category) that optionally backfills existing Transactions, so that a fix sticks for next time.
22. As a Member, I want to create, rename, and merge Budget Categories, so that they match how we actually think.
23. As a Member, I want re-categorization to be re-derivable from the stored raw Akahu payload, so that refining rules doesn't need re-fetching from Akahu.

### The budget (Envelopes)
24. As a Member, I want to create a budget for a Period, optionally copying the previous Period's allocations, so that setting up each month is quick.
25. As a Member, I want to set an Envelope's allocation for a Period, so that I can assign money to a Budget Category.
26. As a Member, I want to see the current Period's budget with per-Envelope allocated/spent/remaining plus income and totals, so that I know where we stand.
27. As a Member, I want to set expected monthly income for the Household, so that "create a budget" can check allocations against what we earn.
28. As a Member, I want actual income computed from credit Transactions tagged as income, so that variable/weekly income (e.g. maternity payments) is captured without special handling.
29. As a Member, I want to Reallocate money from one Envelope to another as an explicit, confirmed write, so that trade-offs are intentional.

### Purchase decisions
30. As a Member, I want to ask "can we afford this $X purchase in category Y?" and get a verdict, so that I can decide with confidence.
31. As a Member, I want the purchase evaluation to tell me the target Envelope's remaining, whether it fits, and the shortfall if not, so that I understand the gap.
32. As a Member, I want the evaluation to list other Envelopes with reallocatable Slack (ranked), so that the AI can suggest what to trim.
33. As a Member, I want the evaluation to show Household headroom and days left in the Period, so that I see our overall capacity.
34. As a Member, I want purchase evaluation to be read-only (advisory), so that asking "what if" changes nothing.
35. As a Member, after I approve a trade-off, I want the AI to make the Reallocation via an explicit tool call, so that the change only happens on my say-so.

### Planned purchases
36. As a Member, I want to add a Planned Purchase (description, amount, target category, target Period, priority), so that I can track things we want to buy.
37. As a Member, I want to list, update, and drop Planned Purchases, so that I can manage our wishlist.
38. As a Member, I want a `plan_period` analysis that tests the whole wishlist against real remaining money by priority, so that I can see what fits this month.
39. As a Member, I want to mark a Planned Purchase as purchased manually, so that I can retire it once bought.
40. As a Member, I want a Planned Purchase to be able to name a future Period, so that I can note things for later.

### Reports
41. As a Member, I want a period summary (spend vs budget, income vs spend, top merchants, trend vs prior months), so that I can review how the month went.
42. As a Member, I want reports returned as structured data the AI renders, so that I can ask follow-up questions conversationally.

### Guided flows
43. As a Member, I want guided flows for `create_budget`, `review_spending`, `plan_purchase`, and `monthly_report`, so that I don't have to remember the steps.
44. As a Member, I want the guidance stored server-side and fetched by a tool, so that both Claude and ChatGPT follow identical steps.
45. As the Claude Member, I want thin Claude skills that wrap the guides as `/slash` commands, so that I get a nice entry point.
46. As the ChatGPT Member (Phase 2), I want a custom GPT that fetches the same guides, so that my experience matches my partner's.

### Access & security
47. As the Claude Member, I want to reach the server privately over Tailscale via a local stdio→HTTP bridge (Phase 1), so that no bank data is exposed publicly and no OAuth is needed.
48. As the Household, I want writes gated by in-conversation confirmation and recorded in an audit log, so that mutations are traceable.
49. As the Household, I want an optional read-only mode flag, so that I can lock the server to reads when desired.
50. As the ChatGPT Member (Phase 2), I want to sign in with OAuth via a managed IdP that maps my email to my Member, so that I can use the shared budget from ChatGPT.

## Implementation Decisions

- **Deployment & transport:** single Node/TS server (ADR-0001), `@modelcontextprotocol/sdk` over Streamable HTTP transport from day one (ADR-0008), self-hosted on a Raspberry Pi with a local sqlite file, reached over Tailscale (ADR-0002). systemd keeps it alive; `node-cron` runs the nightly sync in-process (ADR-0005/0008).
- **Modules (logical):**
  - _Akahu client port_ — an `AkahuClient` interface (list accounts, list transactions with cursor, balances) with a live HTTP implementation; the seam for testing (Seam 2).
  - _Sync engine_ — drives the port, performs incremental idempotent upserts keyed on Akahu txn `_id`, applies pending→settled updates, captures daily balance snapshots, advances a per-Connection cursor, stamps `data-as-of`.
  - _Categorization_ — Mapping Rule store seeded from `personal_finance` groups; resolves each Transaction to a Budget Category (or Uncategorized); supports one-off assignment, rule creation with optional backfill, and re-derivation from stored `raw`.
  - _Budget engine_ — Envelope allocation/spent/remaining, Slack, income (expected + actual), Household headroom; period date-range logic driven by `budget_month_start_day`.
  - _Analysis_ — `evaluate_purchase` (read-only verdict + ranked Slack + headroom) and `plan_period` (priority-greedy wishlist fit); pure functions over engine outputs.
  - _Planned purchases_ — CRUD + status lifecycle (planned/purchased/dropped).
  - _MCP tool layer_ — ~21 tools (see below) wrapping the engines; the primary test seam (Seam 1). zod input schemas.
  - _Workflow guides_ — server-side guide text exposed via a `get_workflow_guide(flow)` tool (ADR-0006).
- **Tool surface (~21):** `list_accounts`, `list_transactions`, `search_transactions`, `refresh`; `list_uncategorized`, `categorize_transaction`, `set_category_rule`, `manage_categories`, `list_categories`; `get_budget`, `create_budget_for_period`, `set_allocation`, `reallocate`, `set_expected_income`; `evaluate_purchase`, `plan_period`, `get_period_summary`; `add_planned_purchase`, `list_planned_purchases`, `update_planned_purchase`, `mark_purchased`, `drop_planned_purchase`; plus `get_workflow_guide`. All reads return structured data + `data-as-of`; all writes are explicit and audit-logged.
- **Schema (Drizzle + better-sqlite3, ADR-0005/0008):** `households`, `members`, `connections`, `accounts`, `transactions` (typed columns + `raw` JSON, money as integer cents + `currency`), `balance_snapshots` (per account per day), `budget_categories`, `mapping_rules`, `budgets`/`envelopes` keyed on Period date range, `planned_purchases`, `settings` (incl. `budget_month_start_day`, `read_only`), `sync_state` (per-Connection cursor), `audit_log`. Never delete; migrations via Drizzle.
- **Money & locale:** all amounts integer minor units + explicit currency (NZD); the server owns all arithmetic (ADR-0003).
- **Auth (phased, ADR-0002):** Phase 1 Tailscale-private, Claude via `mcp-remote` bridge, no OAuth. Phase 2 Tailscale Funnel (or Cloudflare Tunnel) + OAuth 2.1 via managed IdP, email→Member. Verify whether ChatGPT surfaces MCP prompts before relying on them; the guidance is a tool regardless (ADR-0006).
- **Config:** `.env` holds N Akahu token pairs + Tailscale/config; loaded via `dotenv`; secrets never logged or returned by any tool.

## Testing Decisions

- **What makes a good test here:** assert only external behavior — the structured facts a caller receives — never internals. For money, assert exact integer-cent values against fixtures. Tests must be deterministic and never touch live Akahu.
- **Seam 1 — MCP tool boundary (primary):** seed a temp sqlite to a known state, invoke a tool, assert its structured output including `data-as-of`. Owns the behavioral contract for the budget engine, analysis (`evaluate_purchase`, `plan_period`), categorization, `get_budget`, `get_period_summary`, and envelope CRUD. Runner: `vitest`.
- **Seam 2 — Akahu client port:** inject sanitized recorded Akahu responses through the `AkahuClient` interface to drive the sync engine; assert idempotent upserts on txn `_id`, pending→settled without duplication, no double-counting on overlapping windows, and balance-snapshot capture.
- **Optional unit tests:** intricate pure algorithms (priority-greedy `plan_period`, Slack ranking) may get direct unit tests for convenience, but their contract is owned by Seam 1 — not a third seam.
- **Prior art:** none yet (greenfield); these two seams establish the pattern for the repo.

## Out of Scope

Deferred to post-V1 (ADR-0004/0005, and per grilling):
- Full **cashflow projection** (starting balance + income − expenses → projected end-of-period). Primary post-V1 target; balance snapshots are collected from V1 to seed it.
- Envelope **rollover**.
- Planned-purchase **reserving / sinking funds** (the reserving `plan_period` variant).
- **Auto-reconciliation** of Planned Purchases against real Transactions (V1 marks purchased manually).
- **Pay-cycle** Periods (config hook exists via `budget_month_start_day`; logic deferred).
- **Live-Akahu smoke tests.**
- **Phase 2** work (Tailscale Funnel, OAuth/managed IdP, ChatGPT custom GPT) is a later slice, not part of the V1 Claude-private milestone — but the architecture (HTTP transport, email→Member mapping shape) must not preclude it.

## Further Notes

- The anchoring principle (ADR-0003) governs every ambiguous call: if it's a number, the server computes it; if it's a judgment, the LLM makes it over server-provided facts.
- Akahu Personal Apps cannot move money, so the write blast radius is limited to reversible budget/planning data — which is why front-door auth (Phase 1 Tailscale, Phase 2 OAuth) is emphasized over heavy per-write enforcement.
- Ticketing should sequence: sqlite/schema + Akahu client + sync foundation → categorization + budget engine → analysis + planned purchases → tool layer + workflow guides + Claude skills. Phase-2 auth/Funnel/GPT is a fenced-off later slice.

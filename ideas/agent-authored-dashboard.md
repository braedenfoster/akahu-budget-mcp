# Idea: Agent-authored, OAuth-gated dashboard

**Status:** Exploring — paused on one open decision (see below). Not committed.
**Date:** 2026-07-25
**Origin:** `/ask-matt` → `/grilling` session.

## The pitch

A per-Member web dashboard for the household budget. The **agent constructs a
dashboard via MCP** (panels — charts, tables, etc.), then **shares it with the
human as a URL**. The human opens the URL, signs in, and sees the rendered
page. Built with **TanStack Start** (for future routing) and **shadcn/ui**.

## What's settled

1. **Job of the dashboard (Q1).** Async, standing view — the *agent authors*, the
   *human views later*. Not a live in-conversation canvas. The novel mechanic:
   a dashboard is a **JSON config addressed by a hash id** at a dynamic route
   (e.g. `/d/<hash>`); "sharing" = handing over that URL.

2. **Access model (Q2).** **OAuth-gated; the hash identifies, it does not grant.**
   The route sits behind the existing Stytch login. The hash picks *which*
   dashboard; you still must be a signed-in Member to see any data. Rejected the
   capability-URL model (unguessable link = access) — it would punch a hole in
   the one security boundary ADR-0010 leans on (`email → Member` allowlist), and
   bank data leaking via link-forwarding/history is unacceptable.

3. **Topology (Q3 → revised).** Two surfaces, cleanly separated by concern:
   - **TanStack Start app** (new pnpm-workspace package, alongside `auth-page`):
     owns the Stytch login (**migrating `auth-page`'s job onto it**), holds the
     session server-side, serves `/d/<hash>`, renders panels with shadcn.
   - **`akahu-budget-mcp` server:** the agent constructs/mutates dashboards via
     **new MCP authoring tools**. MCP stays the *agent's* channel only.
   - The web app does **not** read data through MCP (that would overload the MCP
     contract). Instead, the **MCP writes dashboard config into SQLite**, and the
     **TanStack server reads the DB directly** (read-only). Both processes are
     LAN/server-bound on the Pi.
   - **Writer/reader split:** MCP is the only writer; TanStack is read-only. Under
     SQLite **WAL** this is a supported concurrent pattern — readers never block
     the single writer. (Earlier "two processes on one DB file" worry only
     applies to two *writers*; withdrawn.)

## The open decision (Q5 — PAUSED HERE)

> With TanStack reading the DB directly and the dashboard being *live*, **who
> computes the panel numbers?** A panel like "spend vs allocated per category" is
> an aggregation (the reports engine computes it today, `src/reports/engine.ts`),
> not a row you read. This puts pressure on **ADR-0003: "the server owns all
> money math — one implementation, never in a client."**

Three options:

- **(A) Shared engine package.** Extract the reports/budget compute into a
  monorepo package both the MCP server and the TanStack server import. TanStack
  reads the DB directly but computes panel data via the **same** engine
  functions (never hand-rolled SQL in the web app). → Live data, one math
  implementation, browser does zero math (it runs in the TanStack *server*).
  **Cost:** refactor engines to take an injected DB handle + live in a shared
  package. *(Recommended in-session.)*

- **(B) Snapshot in the config.** The agent computes numbers at authoring time;
  the MCP tool writes the *rendered data* into the config row. TanStack reads one
  row and draws it — zero math in the web app, simplest read path. **Cost:**
  numbers freeze at authoring time, stale until the agent rebuilds
  (re-introduces the staleness `data-as-of` exists to fight).

- **(C) Re-query in TanStack.** The web app writes its own aggregation SQL.
  Simplest to start, but money math now lives in two codebases — exactly what
  ADR-0003 forbids. A dashboard that quietly disagrees with the conversational
  reports would poison trust. **Not recommended.**

**Braeden wants to think about this before committing.** Everything downstream
(the panel data-binding vocabulary) depends on the answer, so resolve this first
on resume.

## Questions we had NOT reached yet (resume list)

These were queued behind Q5 and are still open:

- **Panel definition / data-binding schema.** What does a panel spec look like?
  A data source (a named computation + params, e.g. "period_summary, current
  month, top 10 merchants") + a visualization spec (chart type, encodings) +
  layout. The shape of the "named computation" depends on the Q5 answer.
- **Dashboard ownership.** Per-Member private, or shared across the household's
  two Members? (`email → Member` already exists; "per-user" probably = per-Member.)
- **Visualization types for v1.** Which panel kinds first — line/bar chart,
  table, single stat/KPI? (shadcn charts are Recharts-based.)
- **MCP authoring tool surface.** The CRUD tools the agent uses to build a
  dashboard (create dashboard, add/update/remove panel, set layout).
- **Layout/composition model.** Grid? Ordered list? How panels arrange.
- **First-party web-app OAuth flow.** The TanStack app needs a normal Stytch
  browser login (session held server-side) — distinct from the DCR flow ChatGPT
  uses on the public `/mcp`. How the migration off `auth-page` works.
- **Deployment.** New systemd service on the Pi for the TanStack app; how it
  relates to / replaces `auth-page.service`; Funnel routing.
- **Scope / phasing / MVP boundary.** Almost certainly a multi-session build →
  `/to-spec` + `/to-tickets` when ready.

## How to resume

Re-open this file in a fresh `/grilling` session, start at the **open decision
(Q5)**, then walk the **resume list** in order.

# Spec: Income Streams

Status: ready-for-agent

_Builds on the shipped Akahu budgeting MCP. Vocabulary follows `CONTEXT.md` (Income, Income Stream, Unclassified income, Income Rule); the governing decision is ADR-0009, refining ADR-0004. Read those first._

## Problem Statement

Income is currently guessed by a sync-time heuristic — every positive, non-`TRANSFER` credit is treated as Income. In real use this **missed half a Household Member's income** (a Paid-Parental-Leave payment that arrives as a bank `TRANSFER`, and/or lands in an Account that isn't a positive-credit signal) and would **over-count** refunds as Income. Because Income is a single household total with no breakdown, the Household also can't see *which* source contributes what — which matters acutely here: the PPL stream ends 30 Nov 2026 and the Household needs to watch it go to zero.

## Solution

Make Income first-class and correctable (ADR-0009):

- A credit is Income **iff** it is classified into a household-defined **Income Stream** (e.g. Salary, PPL). Classification is driven by **Income Rules** over the **same matcher** used for Budget Categories (merchant / description / Akahu `type` / Akahu group), so a payment Akahu never tags as income can still be routed to a Stream.
- A system **Unclassified income** Stream plus a positive-non-`TRANSFER` fallback preserves today's totals on rollout; unmatched positive credits (including transfers) surface in a **review list** so income can't silently vanish.
- Reads report a per-Stream Income breakdown; a **coverage** check flags connected Accounts that have received no Income (the "income lands in an unconnected account" signal).

The server still owns all arithmetic (ADR-0003); Income Streams are the income-side twin of Budget Categories.

## User Stories

1. As a Member, I want a credit counted as Income only when it's classified into an Income Stream, so refunds and internal transfers don't inflate my income.
2. As a Member, I want to create, rename, and merge Income Streams (Salary, PPL, …), so income is broken down by source.
3. As a Member, I want an Income Rule (merchant / description / Akahu `type` / Akahu group → Income Stream) with optional backfill, so a recurring credit is classified once and stays classified — including a partner's pay that arrives as a `TRANSFER`.
4. As a Member, I want to classify a single credit into an Income Stream as a one-off (and to un-classify), so I can fix an odd item without a rule.
5. As a Member, I want positive credits that aren't in a named Income Stream listed for review (largest first, transfers flagged), so income never silently goes missing again.
6. As a Member, I want unmatched positive non-transfer credits to still count (as Unclassified income), so turning this on doesn't drop my totals.
7. As a Member, I want `get_budget` and `get_period_summary` to show Income broken down by Stream alongside expected and actual totals, so I can see (for example) the PPL stream fall to zero in December.
8. As a Member, I want a coverage check that flags connected Accounts with no Income, so I can spot income that's landing somewhere the app can't see.
9. As a Member, I want re-classification to be re-derivable from stored data and history to backfill, so refining Income Rules fixes the past without re-fetching from Akahu.

## Implementation Decisions

- **Shared matcher (Seam-preserving refactor):** extract the merchant/description/`txn_type`/`akahu_group` matching from `src/categorization/engine.ts` into a shared function that takes rows `{matchType, matchValue, targetId, priority, id}` and returns a matched `targetId`. Expense categorization and income classification both call it. Precedence unchanged: merchant (exact) > description (substring) > akahu_group (exact) > txn_type (exact); higher priority then most-recent wins.
- **Schema (Drizzle):** `income_streams` `{id, name unique, is_system, created_at}` with one system row **Unclassified income**; `income_rules` `{id, match_type, match_value, income_stream_id → income_streams, priority, created_at}` unique on `(match_type, match_value)`; add `transactions.income_stream_id` (nullable FK). `transactions.is_income` becomes **derived** (`income_stream_id IS NOT NULL`), set in the classification pass — it stops being set by the sync heuristic.
- **Classification pass** (runs inside the existing categorization pass, so sync → classify stays automatic), for **positive-amount Transactions only**: (1) Income Rule match → named Stream; (2) else positive & `type != 'TRANSFER'` → Unclassified income; (3) else → not Income (`income_stream_id` null). One-off classifications set an override that re-derivation preserves (mirroring `category_override`).
- **Tool surface (new):** `list_income_streams`, `manage_income_streams` (create/rename/merge), `set_income_rule` (optional backfill), `classify_income(transaction_id, income_stream_id|null)`, `list_unclassified_income(period?)`, `income_coverage`. All writes go through the existing write wrapper (audited, read-only-aware). All reads carry `data-as-of`.
- **Reporting:** `get_budget` and `get_period_summary` `income` blocks gain `by_stream: [{stream, actual_cents}]`; existing `expected_cents` / `actual_cents` unchanged (`actual_cents` still = sum of `is_income` credits, now stream-driven).
- **Money & anchoring:** integer cents, server-owned (ADR-0003). No floats.

## Testing Decisions

- **Seam 1 (primary):** seed a temp sqlite, invoke tools, assert structured output including exact integer-cent per-Stream figures and `data-as-of`.
- Must-cover cases: an Income Rule routes Salary/PPL by description and by `txn_type`; a positive **`TRANSFER`** promoted to a Stream via a rule (the missing-PPL scenario); the Unclassified fallback counts a positive non-transfer credit and excludes a transfer; `get_budget.income.by_stream` exact figures; `list_unclassified_income` surfaces a real missing credit (transfer flagged); `set_income_rule` backfill reclassifies history; a one-off `classify_income` survives re-derivation; `income_coverage` flags a zero-income Account; every income write is refused in read-only mode and logs nothing.
- Reuse the existing Seam-2 fake Akahu client / fixtures for seeding; no live Akahu.

## Out of Scope

- **Per-Stream expected income** (expected income stays a single household figure the Household adjusts for the December cliff).
- **Per-Member income attribution** (Streams are by source, not by Member).
- Detecting entirely **unconnected** Accounts (coverage only reasons about connected ones); recurring-charge detection (a separate roadmap item).

## Further Notes

- Rollout must not regress totals: the Unclassified fallback + a one-time reclassify on migration keep actual income whole while the Household refines Streams.
- This is the twin of the shipped `txn_type`/`description` categorization work; lean on that pattern.

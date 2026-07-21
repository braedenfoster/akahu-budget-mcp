# 01 — Income Streams + shared matcher + Income Rules + classification

**What to build:** The engine that makes Income explicit — credits are classified into household-defined Income Streams via Income Rules, reusing the expense matcher, with a fallback that preserves today's totals and re-derivable backfill. No new tools yet; this is the spine tickets 02–03 plug into. See ADR-0009 and `CONTEXT.md` (Income Stream, Unclassified income, Income Rule).

**Blocked by:** None — builds on the shipped categorization engine.

**Status:** shipped — merged to `main` (commit d8ef0d7), validated on real data.

- [x] Extract the merchant/description/`txn_type`/`akahu_group` matching in `src/categorization/engine.ts` into a **shared matcher** taking `{matchType, matchValue, targetId, priority, id}[]` → `(MatchFields) => targetId | undefined`, precedence unchanged; expense categorization refactored to use it (existing Seam-1 tests stay green).
- [x] Drizzle migration: `income_streams` `{id, name unique, is_system, created_at}` seeded with a system **Unclassified income** row; `income_rules` `{id, match_type, match_value, income_stream_id → income_streams, priority, created_at}` unique on `(match_type, match_value)`; `transactions.income_stream_id` nullable FK + an `income_override` flag mirroring `category_override`.
- [x] `transactions.is_income` is set by the **classification pass**, not the sync heuristic: positive-amount txns match Income Rules → named Stream; else positive & `type != 'TRANSFER'` → Unclassified income; else not Income. `is_income` = `income_stream_id IS NOT NULL`. `runCategorization` also runs income classification.
- [x] Backfill: reclassification re-derives non-overridden txns from stored data (no Akahu re-fetch); a one-time reclassify on migration keeps existing actual-income totals whole.
- [x] Seam 1 tests (engine-level via a harness): Income Rule routes by description and by `txn_type`; a positive `TRANSFER` promoted via a rule; Unclassified fallback counts a positive non-transfer and excludes a transfer; backfill reclassifies history; a one-off override survives re-derivation. Exact integer-cent assertions; no live Akahu.

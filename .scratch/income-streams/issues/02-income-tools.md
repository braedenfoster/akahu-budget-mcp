# 02 — Income tools (streams, rules, one-off, review)

**What to build:** The MCP tools the Household drives income with — manage Income Streams, create Income Rules, classify a one-off credit, and review anything money-in that isn't yet a named Stream (the safety net that stops income going missing). See ADR-0009, `CONTEXT.md`, and mirror the shipped category tools.

**Blocked by:** 01.

**Status:** shipped — merged to `main` (commit d8ef0d7), validated on real data.

- [x] `list_income_streams` returns each Stream with its actual total for the Period; `manage_income_streams` (create/rename/merge) mirrors `manage_categories` (Unclassified income cannot be merged away). All mutations go through the write wrapper (audited, read-only-aware).
- [x] `set_income_rule(match_type, match_value, income_stream_id, backfill?)` creates/replaces an Income Rule (reusing the shared matcher) with optional backfill; refuses unknown streams; audited.
- [x] `classify_income(transaction_id, income_stream_id | null)` sets/clears a one-off Income classification as a protected override; audited.
- [x] `list_unclassified_income(period?)` lists positive credits not in a **named** Stream (Unclassified income + positive transfers), largest first, with transfers flagged and a `data-as-of` stamp.
- [x] Tools registered in `src/tools/registry.ts`; reads carry `data-as-of`.
- [x] Seam 1 tests: create/rename/merge streams; `set_income_rule` (incl. promoting a `TRANSFER`) with backfill reclassifies; `classify_income` overrides and clears; `list_unclassified_income` surfaces a real missing credit (transfer flagged); income writes refused in read-only mode and log nothing.

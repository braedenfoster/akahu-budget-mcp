# 04 — Budget Categories + Mapping Rules + categorization

**What to build:** Every Transaction is resolved to a household-defined Budget Category (or Uncategorized) via Mapping Rules seeded from Akahu's `personal_finance` groups, and the Household can manage categories and rules through tools — with a rule able to reclassify existing history. See ADR-0007 and `CONTEXT.md` (Akahu Category vs Budget Category, Mapping Rule, Uncategorized).

**Blocked by:** 03.

**Status:** shipped — implemented on `main` (commit 944f62a).

- [x] `budget_categories` and `mapping_rules` tables exist; an explicit **Uncategorized** Budget Category always exists so totals reconcile.
- [x] On import, each Transaction resolves to a Budget Category via Mapping Rules seeded from `personal_finance` groups; unmatched → Uncategorized.
- [x] `manage_categories` (create/rename/merge) and `list_categories` work; `list_uncategorized` returns unmapped Transactions for the Period.
- [x] `categorize_transaction` sets a one-off assignment; `set_category_rule` (merchant or Akahu Category → Budget Category) creates a rule with **optional backfill**, re-deriving affected Transactions from the stored `raw` payload (no Akahu re-fetch).
- [x] Category/rule mutations go through the write wrapper (audited, read-only-aware).
- [x] Seam 1 tests: seed transactions → assert correct Budget Category resolution; add a rule with backfill → assert history reclassifies; rename/merge preserves reconciliation.

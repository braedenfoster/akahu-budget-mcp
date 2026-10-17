# 01: Committed/Flexible flag on Budget Categories

**What to build:** Every Budget Category carries a permanent Committed or Flexible flag (ADR-0011). A Member sees the flag when listing categories, must choose it when creating a category, and can change it later. After the migration, every existing category is Committed, so the Spending allowance starts too low rather than too high.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

Spec: `.scratch/spending-allowance/spec.md` (Schema, Tools)

- [ ] The migration adds the flag and sets every existing category, including Uncategorized, to Committed
- [ ] `list_categories` returns each category's flag
- [ ] `manage_categories` `create` refuses a request without the flag and accepts `committed` or `flexible`
- [ ] A new `manage_categories` `set_kind` action changes a category's flag
- [ ] `set_kind` on the Uncategorized system category is refused
- [ ] `merge` keeps the target category's flag
- [ ] `create` and `set_kind` are audited and refused in read-only mode
- [ ] Seam 1 tests cover each criterion above

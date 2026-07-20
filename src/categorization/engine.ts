import { and, eq, isNotNull, sql } from "drizzle-orm";
import type { AppContext } from "../context.js";
import { budgetCategories, mappingRules, transactions } from "../db/schema.js";
import { buildMatcher, type MatchFields } from "../matching/matcher.js";
import { runIncomeClassification } from "../income/engine.js";

export const UNCATEGORIZED_NAME = "Uncategorized";

/** Ensure the system Uncategorized Budget Category exists; return its id. */
export function ensureUncategorized(ctx: AppContext): number {
  const existing = ctx.db
    .select({ id: budgetCategories.id })
    .from(budgetCategories)
    .where(eq(budgetCategories.name, UNCATEGORIZED_NAME))
    .get();
  if (existing) return existing.id;
  return ctx.db
    .insert(budgetCategories)
    .values({ name: UNCATEGORIZED_NAME, isSystem: true, createdAt: ctx.now().toISOString() })
    .returning({ id: budgetCategories.id })
    .get().id;
}

/** Ensure a Budget Category with the given name exists; return its id. */
export function ensureCategoryByName(ctx: AppContext, name: string): number {
  const existing = ctx.db
    .select({ id: budgetCategories.id })
    .from(budgetCategories)
    .where(eq(budgetCategories.name, name))
    .get();
  if (existing) return existing.id;
  return ctx.db
    .insert(budgetCategories)
    .values({ name, isSystem: false, createdAt: ctx.now().toISOString() })
    .returning({ id: budgetCategories.id })
    .get().id;
}

/**
 * Seed Budget Categories + group Mapping Rules from the Akahu personal_finance
 * groups present in the cached Transactions (ADR-0007), so categorization works
 * on day one. Idempotent. Ingestion — not audited.
 */
export function seedRulesFromTransactions(ctx: AppContext): void {
  ensureUncategorized(ctx);
  const groups = ctx.db
    .selectDistinct({ group: transactions.akahuCategoryGroup })
    .from(transactions)
    .where(isNotNull(transactions.akahuCategoryGroup))
    .all();
  for (const { group } of groups) {
    if (!group) continue;
    const categoryId = ensureCategoryByName(ctx, group);
    ctx.db
      .insert(mappingRules)
      .values({
        matchType: "akahu_group",
        matchValue: group,
        budgetCategoryId: categoryId,
        priority: 0,
        createdAt: ctx.now().toISOString(),
      })
      .onConflictDoNothing()
      .run();
  }
}

interface Resolver {
  uncategorizedId: number;
  resolve(fields: MatchFields): number;
}

/**
 * Load all Mapping Rules once and return an in-memory resolver over the shared
 * matcher (ADR-0009). Precedence is defined in `buildMatcher`; anything the
 * matcher leaves unmatched falls back to the system Uncategorized Category so
 * totals always reconcile. This lets payments with no merchant/group (e.g. a
 * mortgage, which Akahu only tags with type=LOAN, or a standing order
 * identified by its description) still be routed to a Budget Category.
 */
export function buildResolver(ctx: AppContext): Resolver {
  const uncategorizedId = ensureUncategorized(ctx);
  const rules = ctx.db
    .select({
      matchType: mappingRules.matchType,
      matchValue: mappingRules.matchValue,
      targetId: mappingRules.budgetCategoryId,
      priority: mappingRules.priority,
      id: mappingRules.id,
    })
    .from(mappingRules)
    .all();
  const match = buildMatcher(rules);
  return {
    uncategorizedId,
    resolve: (fields) => match(fields) ?? uncategorizedId,
  };
}

/**
 * Re-derive the Budget Category for every non-overridden Transaction from its
 * stored merchant/group (extracted from the raw Akahu payload at sync time), so
 * refining rules reclassifies history without re-fetching (ADR-0005/0007).
 * Returns the number of Transactions whose category changed.
 */
export function recategorize(ctx: AppContext): number {
  const resolver = buildResolver(ctx);
  const rows = ctx.db
    .select({
      akahuId: transactions.akahuId,
      merchant: transactions.merchant,
      description: transactions.description,
      group: transactions.akahuCategoryGroup,
      type: transactions.type,
      current: transactions.budgetCategoryId,
    })
    .from(transactions)
    .where(eq(transactions.categoryOverride, false))
    .all();

  let changed = 0;
  ctx.db.transaction(() => {
    for (const row of rows) {
      const resolved = resolver.resolve({
        merchant: row.merchant,
        description: row.description,
        group: row.group,
        type: row.type,
      });
      if (row.current !== resolved) {
        ctx.db
          .update(transactions)
          .set({ budgetCategoryId: resolved })
          .where(eq(transactions.akahuId, row.akahuId))
          .run();
        changed++;
      }
    }
  });
  return changed;
}

/**
 * Seed categories/rules from data, resolve every Transaction's Budget Category,
 * then classify Income into Streams (ADR-0009). Income classification runs here
 * so that sync -> categorize -> classify stays a single automatic pass and
 * `transactions.is_income` is derived, never guessed by the sync heuristic.
 */
export function runCategorization(ctx: AppContext): void {
  seedRulesFromTransactions(ctx);
  recategorize(ctx);
  runIncomeClassification(ctx);
}

/** Count Transactions currently assigned to a Budget Category. */
export function transactionCountForCategory(ctx: AppContext, categoryId: number): number {
  const row = ctx.db
    .select({ n: sql<number>`count(*)` })
    .from(transactions)
    .where(eq(transactions.budgetCategoryId, categoryId))
    .get();
  return row?.n ?? 0;
}

/** Reassign every Transaction and Mapping Rule from one category to another. */
export function reassignCategory(ctx: AppContext, fromId: number, toId: number): void {
  ctx.db
    .update(transactions)
    .set({ budgetCategoryId: toId })
    .where(eq(transactions.budgetCategoryId, fromId))
    .run();
  ctx.db
    .update(mappingRules)
    .set({ budgetCategoryId: toId })
    .where(eq(mappingRules.budgetCategoryId, fromId))
    .run();
}

/** True if the given category is the system Uncategorized one. */
export function isSystemCategory(ctx: AppContext, categoryId: number): boolean {
  const row = ctx.db
    .select({ isSystem: budgetCategories.isSystem })
    .from(budgetCategories)
    .where(eq(budgetCategories.id, categoryId))
    .get();
  return row?.isSystem ?? false;
}

/** Guard: does a category exist? */
export function categoryExists(ctx: AppContext, categoryId: number): boolean {
  return (
    ctx.db
      .select({ id: budgetCategories.id })
      .from(budgetCategories)
      .where(and(eq(budgetCategories.id, categoryId)))
      .get() !== undefined
  );
}

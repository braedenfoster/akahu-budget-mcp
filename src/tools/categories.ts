import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { budgetMonthStartDay, getDataAsOf, type AppContext } from "../context.js";
import { budgetCategories, CATEGORY_KINDS, transactions } from "../db/schema.js";
import { formatCents } from "../money.js";
import { periodFromKey } from "../period.js";
import { withWrite } from "../write.js";
import {
  categoryByName,
  categoryExists,
  ensureCategoryByName,
  ensureUncategorized,
  isSystemCategory,
  planRecategorization,
  reassignCategory,
  recategorize,
  type CategoryMove,
} from "../categorization/engine.js";
import { mappingRules } from "../db/schema.js";
import { defineTool } from "./types.js";
import { periodKeySchema } from "./schemas.js";

/** List all Budget Categories with how many Transactions each currently holds. */
export const listCategoriesTool = defineTool({
  name: "list_categories",
  description:
    "List all Budget Categories (including the system Uncategorized) with each one's kind (committed or flexible) and the number of Transactions currently assigned to it. Read-only with data-as-of.",
  inputSchema: {},
  handler: (ctx) => {
    ensureUncategorized(ctx);
    const rows = ctx.db
      .select({
        id: budgetCategories.id,
        name: budgetCategories.name,
        isSystem: budgetCategories.isSystem,
        kind: budgetCategories.kind,
        count: sql<number>`count(${transactions.akahuId})`,
      })
      .from(budgetCategories)
      .leftJoin(transactions, eq(transactions.budgetCategoryId, budgetCategories.id))
      .groupBy(budgetCategories.id)
      .all();
    return {
      categories: rows.map((r) => ({
        id: r.id,
        name: r.name,
        is_system: r.isSystem,
        kind: r.kind,
        transaction_count: r.count,
      })),
      data_as_of: getDataAsOf(ctx),
    };
  },
});

/**
 * Create, rename, set the kind of, or merge Budget Categories (user story 22).
 * Audited and read-only-aware. Merge reassigns Transactions + rules to the
 * target then removes the now-empty source category (its Transactions keep
 * reconciling).
 */
export const manageCategoriesTool = defineTool({
  name: "manage_categories",
  description:
    "Create, rename, set the kind of, or merge Budget Categories. Every category is committed (recurring payments, savings, debt repayment, sinking funds) or flexible (variable spending); ask the Member which before creating one. create: {name, kind}. rename: {id, new_name}. set_kind: {id, kind} (not allowed on Uncategorized). merge: {source_id, target_id} (the target keeps its kind). Audited; refused in read-only mode.",
  inputSchema: {
    action: z.enum(["create", "rename", "set_kind", "merge"]),
    name: z.string().min(1).optional(),
    kind: z.enum(CATEGORY_KINDS).optional(),
    id: z.number().int().optional(),
    new_name: z.string().min(1).optional(),
    source_id: z.number().int().optional(),
    target_id: z.number().int().optional(),
  },
  handler: (ctx, input) => {
    if (input.action === "create") {
      if (!input.name || !input.kind)
        throw new Error("create requires `name` and `kind` (committed or flexible).");
      const { name, kind } = input;
      const existing = categoryByName(ctx, name);
      if (existing && existing.kind !== kind)
        throw new Error(
          `Category ${name} already exists as ${existing.kind}; use set_kind to change it.`,
        );
      return withWrite(
        ctx,
        {
          tool: "manage_categories",
          summary: `create ${kind} category ${name}`,
          payload: { name, kind },
        },
        () => ({ ...ensureCategoryByName(ctx, name, kind), name }),
      );
    }
    if (input.action === "rename") {
      if (input.id === undefined || !input.new_name)
        throw new Error("rename requires `id` and `new_name`.");
      const { id, new_name } = input;
      if (!categoryExists(ctx, id)) throw new Error(`No category with id ${id}.`);
      return withWrite(
        ctx,
        {
          tool: "manage_categories",
          summary: `rename category ${id} -> ${new_name}`,
          payload: { id, new_name },
        },
        () => {
          ctx.db
            .update(budgetCategories)
            .set({ name: new_name })
            .where(eq(budgetCategories.id, id))
            .run();
          return { id, name: new_name };
        },
      );
    }
    if (input.action === "set_kind") {
      if (input.id === undefined || !input.kind)
        throw new Error("set_kind requires `id` and `kind` (committed or flexible).");
      const { id, kind } = input;
      if (!categoryExists(ctx, id)) throw new Error(`No category with id ${id}.`);
      // The Spending allowance has its own rule for Uncategorized spend (ADR-0011).
      if (isSystemCategory(ctx, id))
        throw new Error("The Uncategorized category's kind cannot be changed.");
      return withWrite(
        ctx,
        {
          tool: "manage_categories",
          summary: `set category ${id} kind -> ${kind}`,
          payload: { id, kind },
        },
        () => {
          ctx.db.update(budgetCategories).set({ kind }).where(eq(budgetCategories.id, id)).run();
          return { id, kind };
        },
      );
    }
    // merge
    if (input.source_id === undefined || input.target_id === undefined)
      throw new Error("merge requires `source_id` and `target_id`.");
    const { source_id, target_id } = input;
    if (source_id === target_id) throw new Error("Cannot merge a category into itself.");
    if (!categoryExists(ctx, source_id)) throw new Error(`No category with id ${source_id}.`);
    if (!categoryExists(ctx, target_id)) throw new Error(`No category with id ${target_id}.`);
    if (isSystemCategory(ctx, source_id))
      throw new Error("The Uncategorized category cannot be merged away.");
    return withWrite(
      ctx,
      {
        tool: "manage_categories",
        summary: `merge category ${source_id} into ${target_id}`,
        payload: { source_id, target_id },
      },
      () => {
        reassignCategory(ctx, source_id, target_id);
        ctx.db.delete(budgetCategories).where(eq(budgetCategories.id, source_id)).run();
        return { merged: source_id, into: target_id };
      },
    );
  },
});

/** List Transactions currently in Uncategorized for a Period (user story 18). */
export const listUncategorizedTool = defineTool({
  name: "list_uncategorized",
  description:
    "List Transactions currently resolved to Uncategorized, optionally within a Period (YYYY-MM). Read-only with data-as-of.",
  inputSchema: {
    period: periodKeySchema.optional(),
    limit: z.number().int().min(1).max(1000).default(200),
  },
  handler: (ctx, input) => {
    const uncategorizedId = ensureUncategorized(ctx);
    const filters = [eq(transactions.budgetCategoryId, uncategorizedId)];
    if (input.period) {
      const p = periodFromKey(input.period, budgetMonthStartDay(ctx));
      filters.push(sql`${transactions.date} >= ${p.startDate}`);
      filters.push(sql`${transactions.date} <= ${p.endDate}`);
    }
    const rows = ctx.db
      .select({
        id: transactions.akahuId,
        date: transactions.date,
        amountCents: transactions.amountCents,
        currency: transactions.currency,
        description: transactions.description,
        merchant: transactions.merchant,
        group: transactions.akahuCategoryGroup,
      })
      .from(transactions)
      .where(and(...filters))
      .orderBy(sql`${transactions.date} desc`)
      .limit(input.limit)
      .all();
    return {
      transactions: rows.map((r) => ({
        id: r.id,
        date: r.date,
        amount_cents: r.amountCents,
        amount_display: formatCents(r.amountCents, r.currency),
        description: r.description,
        merchant: r.merchant,
        akahu_category_group: r.group,
      })),
      count: rows.length,
      data_as_of: getDataAsOf(ctx),
    };
  },
});

/** Assign one Transaction to a Budget Category as a protected one-off override. */
export const categorizeTransactionTool = defineTool({
  name: "categorize_transaction",
  description:
    "Assign a single Transaction to a Budget Category as a one-off override (protected from rule re-derivation). Audited; refused in read-only mode.",
  inputSchema: {
    transaction_id: z.string().min(1),
    category_id: z.number().int(),
  },
  handler: (ctx, input) => {
    if (!categoryExists(ctx, input.category_id))
      throw new Error(`No category with id ${input.category_id}.`);
    const txn = ctx.db
      .select({ id: transactions.akahuId })
      .from(transactions)
      .where(eq(transactions.akahuId, input.transaction_id))
      .get();
    if (!txn) throw new Error(`No transaction with id ${input.transaction_id}.`);
    return withWrite(
      ctx,
      {
        tool: "categorize_transaction",
        summary: `categorize ${input.transaction_id} -> ${input.category_id}`,
        payload: input,
      },
      () => {
        ctx.db
          .update(transactions)
          .set({ budgetCategoryId: input.category_id, categoryOverride: true })
          .where(eq(transactions.akahuId, input.transaction_id))
          .run();
        return { transaction_id: input.transaction_id, category_id: input.category_id };
      },
    );
  },
});

/**
 * Create a Mapping Rule (merchant or Akahu group -> Budget Category) with
 * optional backfill of existing history (user story 21). Audited.
 */
export const setCategoryRuleTool = defineTool({
  name: "set_category_rule",
  description:
    "Create/replace a Mapping Rule routing a Transaction to a Budget Category, optionally backfilling existing Transactions. match_type is one of: merchant (exact), description (substring), akahu_group (exact), txn_type (exact Akahu type, e.g. LOAN). Audited; refused in read-only mode. With dry_run: true, writes nothing and returns how many Transactions the backfill would reclassify (would_reclassify), grouped by source and target Budget Category (moves). The count includes every Transaction the backfill would re-derive, not only those the new rule matches. With backfill: false it previews 0. Run a dry run before a rule that splits a category.",
  inputSchema: {
    match_type: z.enum(["merchant", "description", "akahu_group", "txn_type"]),
    match_value: z.string().min(1),
    category_id: z.number().int(),
    priority: z.number().int().default(0),
    backfill: z.boolean().default(true),
    dry_run: z.boolean().default(false),
  },
  handler: (ctx, input) => {
    if (!categoryExists(ctx, input.category_id))
      throw new Error(`No category with id ${input.category_id}.`);
    if (input.dry_run) {
      const moves = input.backfill
        ? planRecategorization(ctx, {
            matchType: input.match_type,
            matchValue: input.match_value,
            budgetCategoryId: input.category_id,
            priority: input.priority,
          })
        : [];
      return {
        dry_run: true as const,
        match_type: input.match_type,
        match_value: input.match_value,
        category_id: input.category_id,
        would_reclassify: moves.length,
        moves: summarizeMoves(ctx, moves),
      };
    }
    return withWrite(
      ctx,
      {
        tool: "set_category_rule",
        summary: `rule ${input.match_type}:${input.match_value} -> ${input.category_id}`,
        payload: input,
      },
      () => {
        ctx.db
          .insert(mappingRules)
          .values({
            matchType: input.match_type,
            matchValue: input.match_value,
            budgetCategoryId: input.category_id,
            priority: input.priority,
            createdAt: ctx.now().toISOString(),
          })
          .onConflictDoUpdate({
            target: [mappingRules.matchType, mappingRules.matchValue],
            set: { budgetCategoryId: input.category_id, priority: input.priority },
          })
          .run();
        const reclassified = input.backfill ? recategorize(ctx) : 0;
        return {
          match_type: input.match_type,
          match_value: input.match_value,
          category_id: input.category_id,
          reclassified,
        };
      },
    );
  },
});

function summarizeMoves(ctx: AppContext, moves: CategoryMove[]) {
  const names = new Map(
    ctx.db
      .select({ id: budgetCategories.id, name: budgetCategories.name })
      .from(budgetCategories)
      .all()
      .map((c) => [c.id, c.name]),
  );
  const groups = new Map<string, { fromId: number | null; toId: number; count: number }>();
  for (const { fromId, toId } of moves) {
    const key = `${fromId}->${toId}`;
    const group = groups.get(key) ?? { fromId, toId, count: 0 };
    group.count++;
    groups.set(key, group);
  }
  return [...groups.values()]
    .sort((a, b) => b.count - a.count)
    .map((g) => ({
      from_category_id: g.fromId,
      from_category: g.fromId === null ? null : (names.get(g.fromId) ?? null),
      to_category_id: g.toId,
      to_category: names.get(g.toId) ?? null,
      count: g.count,
    }));
}

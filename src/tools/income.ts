import { and, eq, gt, or, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { budgetMonthStartDay, getDataAsOf } from "../context.js";
import { incomeRules, incomeStreams, transactions } from "../db/schema.js";
import { formatCents } from "../money.js";
import { resolvePeriod } from "../budget/engine.js";
import { periodFromKey } from "../period.js";
import { withWrite } from "../write.js";
import {
  ensureIncomeStreamByName,
  ensureUnclassifiedIncome,
  incomeCoverage,
  incomeStreamExists,
  isSystemIncomeStream,
  reassignIncomeStream,
  reclassifyIncome,
  streamActuals,
} from "../income/engine.js";
import { defineTool } from "./types.js";
import { optionalPeriod } from "./schemas.js";

/** List all Income Streams with their actual total for a Period (user story 2). */
export const listIncomeStreamsTool = defineTool({
  name: "list_income_streams",
  description:
    "List all Income Streams (including the system Unclassified income) with each Stream's actual Income for a Period (integer cents), plus data-as-of. Defaults to the current Period.",
  inputSchema: { period: optionalPeriod },
  handler: (ctx, input) => {
    ensureUnclassifiedIncome(ctx);
    const period = resolvePeriod(ctx, input.period);
    const streams = streamActuals(ctx, period);
    return {
      period: period.key,
      streams: streams.map((s) => ({
        id: s.stream_id,
        name: s.stream,
        is_system: s.is_system,
        actual_cents: s.actual_cents,
        actual_display: formatCents(s.actual_cents),
      })),
      data_as_of: getDataAsOf(ctx),
    };
  },
});

/**
 * Create, rename, or merge Income Streams (user story 2), mirroring
 * manage_categories. Merge reassigns Transactions + Income Rules to the target
 * then removes the now-empty source; the system Unclassified income cannot be
 * merged away. Audited and read-only-aware.
 */
export const manageIncomeStreamsTool = defineTool({
  name: "manage_income_streams",
  description:
    "Create, rename, or merge Income Streams. create: {name}. rename: {id, new_name}. merge: {source_id, target_id}. The Unclassified income Stream cannot be merged away. Audited; refused in read-only mode.",
  inputSchema: {
    action: z.enum(["create", "rename", "merge"]),
    name: z.string().min(1).optional(),
    id: z.number().int().optional(),
    new_name: z.string().min(1).optional(),
    source_id: z.number().int().optional(),
    target_id: z.number().int().optional(),
  },
  handler: (ctx, input) => {
    if (input.action === "create") {
      if (!input.name) throw new Error("create requires `name`.");
      const name = input.name;
      return withWrite(
        ctx,
        { tool: "manage_income_streams", summary: `create income stream ${name}`, payload: { name } },
        () => ({ id: ensureIncomeStreamByName(ctx, name), name }),
      );
    }
    if (input.action === "rename") {
      if (input.id === undefined || !input.new_name)
        throw new Error("rename requires `id` and `new_name`.");
      const { id, new_name } = input;
      if (!incomeStreamExists(ctx, id)) throw new Error(`No income stream with id ${id}.`);
      return withWrite(
        ctx,
        {
          tool: "manage_income_streams",
          summary: `rename income stream ${id} -> ${new_name}`,
          payload: { id, new_name },
        },
        () => {
          ctx.db
            .update(incomeStreams)
            .set({ name: new_name })
            .where(eq(incomeStreams.id, id))
            .run();
          return { id, name: new_name };
        },
      );
    }
    // merge
    if (input.source_id === undefined || input.target_id === undefined)
      throw new Error("merge requires `source_id` and `target_id`.");
    const { source_id, target_id } = input;
    if (source_id === target_id) throw new Error("Cannot merge an income stream into itself.");
    if (!incomeStreamExists(ctx, source_id))
      throw new Error(`No income stream with id ${source_id}.`);
    if (!incomeStreamExists(ctx, target_id))
      throw new Error(`No income stream with id ${target_id}.`);
    if (isSystemIncomeStream(ctx, source_id))
      throw new Error("The Unclassified income Stream cannot be merged away.");
    return withWrite(
      ctx,
      {
        tool: "manage_income_streams",
        summary: `merge income stream ${source_id} into ${target_id}`,
        payload: { source_id, target_id },
      },
      () => {
        reassignIncomeStream(ctx, source_id, target_id);
        ctx.db.delete(incomeStreams).where(eq(incomeStreams.id, source_id)).run();
        return { merged: source_id, into: target_id };
      },
    );
  },
});

/**
 * Create/replace an Income Rule (merchant / description / akahu_group / txn_type
 * -> Income Stream) with optional backfill (user story 3). Reuses the shared
 * matcher; refuses unknown Streams. Audited.
 */
export const setIncomeRuleTool = defineTool({
  name: "set_income_rule",
  description:
    "Create/replace an Income Rule routing a credit to an Income Stream, optionally backfilling existing Transactions. match_type is one of: merchant (exact), description (substring), akahu_group (exact), txn_type (exact Akahu type, e.g. TRANSFER for a partner's pay). Audited; refused in read-only mode.",
  inputSchema: {
    match_type: z.enum(["merchant", "description", "akahu_group", "txn_type"]),
    match_value: z.string().min(1),
    income_stream_id: z.number().int(),
    priority: z.number().int().default(0),
    backfill: z.boolean().default(true),
  },
  handler: (ctx, input) => {
    if (!incomeStreamExists(ctx, input.income_stream_id))
      throw new Error(`No income stream with id ${input.income_stream_id}.`);
    return withWrite(
      ctx,
      {
        tool: "set_income_rule",
        summary: `income rule ${input.match_type}:${input.match_value} -> ${input.income_stream_id}`,
        payload: input,
      },
      () => {
        ctx.db
          .insert(incomeRules)
          .values({
            matchType: input.match_type,
            matchValue: input.match_value,
            incomeStreamId: input.income_stream_id,
            priority: input.priority,
            createdAt: ctx.now().toISOString(),
          })
          .onConflictDoUpdate({
            target: [incomeRules.matchType, incomeRules.matchValue],
            set: { incomeStreamId: input.income_stream_id, priority: input.priority },
          })
          .run();
        const reclassified = input.backfill ? reclassifyIncome(ctx) : 0;
        return {
          match_type: input.match_type,
          match_value: input.match_value,
          income_stream_id: input.income_stream_id,
          reclassified,
        };
      },
    );
  },
});

/**
 * Classify a single credit into an Income Stream as a protected one-off, or pass
 * income_stream_id=null to mark it explicitly NOT Income (user story 4). The
 * override survives Income Rule re-derivation. Audited.
 */
export const classifyIncomeTool = defineTool({
  name: "classify_income",
  description:
    "Classify a single Transaction into an Income Stream as a one-off override (protected from rule re-derivation), or pass income_stream_id=null to mark it explicitly not Income. Audited; refused in read-only mode.",
  inputSchema: {
    transaction_id: z.string().min(1),
    income_stream_id: z.number().int().nullable(),
  },
  handler: (ctx, input) => {
    if (input.income_stream_id !== null && !incomeStreamExists(ctx, input.income_stream_id))
      throw new Error(`No income stream with id ${input.income_stream_id}.`);
    const txn = ctx.db
      .select({ id: transactions.akahuId })
      .from(transactions)
      .where(eq(transactions.akahuId, input.transaction_id))
      .get();
    if (!txn) throw new Error(`No transaction with id ${input.transaction_id}.`);
    return withWrite(
      ctx,
      {
        tool: "classify_income",
        summary: `classify income ${input.transaction_id} -> ${input.income_stream_id ?? "none"}`,
        payload: input,
      },
      () => {
        ctx.db
          .update(transactions)
          .set({
            incomeStreamId: input.income_stream_id,
            isIncome: input.income_stream_id !== null,
            incomeOverride: true,
          })
          .where(eq(transactions.akahuId, input.transaction_id))
          .run();
        return { transaction_id: input.transaction_id, income_stream_id: input.income_stream_id };
      },
    );
  },
});

/**
 * List positive credits not in a named Income Stream — the Unclassified income
 * fallback plus positive transfers no rule has promoted — largest first, with
 * transfers flagged (user story 5). The safety net that stops Income going
 * missing. Read-only with data-as-of.
 */
export const listUnclassifiedIncomeTool = defineTool({
  name: "list_unclassified_income",
  description:
    "List positive credits not classified into a named Income Stream (the Unclassified income fallback plus positive transfers), largest first, with transfers flagged. Optionally within a Period. Read-only with data-as-of.",
  inputSchema: {
    period: optionalPeriod,
    limit: z.number().int().min(1).max(1000).default(200),
  },
  handler: (ctx, input) => {
    const unclassifiedId = ensureUnclassifiedIncome(ctx);
    const filters = [
      gt(transactions.amountCents, 0),
      // The Unclassified fallback, plus positive credits no rule caught yet
      // (e.g. transfers) — but NOT ones a Member explicitly dismissed as
      // not-Income via classify_income(null), so a decision isn't re-nagged.
      or(
        eq(transactions.incomeStreamId, unclassifiedId),
        and(isNull(transactions.incomeStreamId), eq(transactions.incomeOverride, false)),
      ),
    ];
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
        type: transactions.type,
      })
      .from(transactions)
      .where(and(...filters))
      .orderBy(sql`${transactions.amountCents} desc`)
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
        type: r.type,
        is_transfer: r.type === "TRANSFER",
      })),
      count: rows.length,
      data_as_of: getDataAsOf(ctx),
    };
  },
});

/**
 * Per connected Account, the Income seen in a Period, flagging Accounts with
 * zero Income as possible missing-income sources (user story 8) — the "income
 * lands somewhere the app can't see" signal. Read-only with data-as-of.
 */
export const incomeCoverageTool = defineTool({
  name: "income_coverage",
  description:
    "Report the Income seen per connected Account for a Period (integer cents), flagging Accounts with zero Income as possible missing-income sources, plus a rolled-up total and data-as-of. Defaults to the current Period.",
  inputSchema: { period: optionalPeriod },
  handler: (ctx, input) => {
    const period = resolvePeriod(ctx, input.period);
    const coverage = incomeCoverage(ctx, period);
    return {
      period: period.key,
      accounts: coverage.accounts.map((a) => ({
        ...a,
        income_display: formatCents(a.income_cents),
      })),
      total_income_cents: coverage.total_income_cents,
      data_as_of: getDataAsOf(ctx),
    };
  },
});

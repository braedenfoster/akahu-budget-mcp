import { and, desc, eq, gte, like, lte, or, type SQL } from "drizzle-orm";
import { z } from "zod";
import {
  budgetMonthStartDay,
  getDataAsOf,
} from "../context.js";
import { accounts, connections, members, transactions } from "../db/schema.js";
import { formatCents } from "../money.js";
import { periodFromKey } from "../period.js";
import { defineTool } from "./types.js";
import { optionalPeriod } from "./schemas.js";
import type { AppContext } from "../context.js";

const txnShape = {
  akahuId: transactions.akahuId,
  accountId: transactions.accountId,
  date: transactions.date,
  amountCents: transactions.amountCents,
  currency: transactions.currency,
  description: transactions.description,
  merchant: transactions.merchant,
  akahuCategoryGroup: transactions.akahuCategoryGroup,
  type: transactions.type,
  pending: transactions.pending,
  isIncome: transactions.isIncome,
  memberName: members.name,
};

type TxnSelectRow = {
  akahuId: string;
  accountId: string;
  date: string;
  amountCents: number;
  currency: string;
  description: string;
  merchant: string | null;
  akahuCategoryGroup: string | null;
  type: string | null;
  pending: boolean;
  isIncome: boolean;
  memberName: string;
};

function shapeTxn(r: TxnSelectRow) {
  return {
    id: r.akahuId,
    account_id: r.accountId,
    date: r.date,
    amount_cents: r.amountCents,
    currency: r.currency,
    amount_display: formatCents(r.amountCents, r.currency),
    description: r.description,
    merchant: r.merchant,
    akahu_category_group: r.akahuCategoryGroup,
    type: r.type,
    pending: r.pending,
    is_income: r.isIncome,
    member: r.memberName,
  };
}

function runTxnQuery(ctx: AppContext, filters: SQL[], limit: number): TxnSelectRow[] {
  const base = ctx.db
    .select(txnShape)
    .from(transactions)
    .innerJoin(accounts, eq(transactions.accountId, accounts.akahuId))
    .innerJoin(connections, eq(accounts.connectionId, connections.id))
    .innerJoin(members, eq(connections.memberId, members.id));
  const where = filters.length ? and(...filters) : undefined;
  return (where ? base.where(where) : base)
    .orderBy(desc(transactions.date), desc(transactions.akahuId))
    .limit(limit)
    .all();
}

/**
 * List Transactions filtered by Period, Account, Member, merchant, and amount
 * range. Read-only; carries a data-as-of stamp (ticket 03, user story 14).
 */
export const listTransactionsTool = defineTool({
  name: "list_transactions",
  description:
    "List cached Transactions filtered by Period (YYYY-MM), Budget Category, account_id, member, merchant substring, and signed amount range (cents). Read-only with a data-as-of stamp.",
  inputSchema: {
    period: optionalPeriod,
    category_id: z
      .number()
      .int()
      .optional()
      .describe("Budget Category id to filter by"),
    account_id: z.string().optional(),
    member: z.string().optional().describe("Member name (exact match)"),
    merchant: z.string().optional().describe("Merchant name substring match"),
    min_amount_cents: z.number().int().optional(),
    max_amount_cents: z.number().int().optional(),
    limit: z.number().int().min(1).max(1000).default(100),
  },
  handler: (ctx, input) => {
    const filters: SQL[] = [];
    if (input.period) {
      const p = periodFromKey(input.period, budgetMonthStartDay(ctx));
      filters.push(gte(transactions.date, p.startDate));
      filters.push(lte(transactions.date, p.endDate));
    }
    if (input.category_id !== undefined)
      filters.push(eq(transactions.budgetCategoryId, input.category_id));
    if (input.account_id) filters.push(eq(transactions.accountId, input.account_id));
    if (input.member) filters.push(eq(members.name, input.member));
    if (input.merchant) filters.push(like(transactions.merchant, `%${input.merchant}%`));
    if (input.min_amount_cents !== undefined)
      filters.push(gte(transactions.amountCents, input.min_amount_cents));
    if (input.max_amount_cents !== undefined)
      filters.push(lte(transactions.amountCents, input.max_amount_cents));

    const rows = runTxnQuery(ctx, filters, input.limit);
    return {
      transactions: rows.map(shapeTxn),
      count: rows.length,
      data_as_of: getDataAsOf(ctx),
    };
  },
});

/**
 * Full-text-ish search over Transaction description and merchant (ticket 03,
 * user story 15). Read-only with a data-as-of stamp.
 */
export const searchTransactionsTool = defineTool({
  name: "search_transactions",
  description:
    "Search Transactions by text across description and merchant. Read-only with a data-as-of stamp.",
  inputSchema: {
    query: z.string().min(1).describe("Text to search for in description or merchant"),
    limit: z.number().int().min(1).max(1000).default(100),
  },
  handler: (ctx, input) => {
    const term = `%${input.query}%`;
    const filter = or(
      like(transactions.description, term),
      like(transactions.merchant, term),
    );
    const rows = runTxnQuery(ctx, filter ? [filter] : [], input.limit);
    return {
      query: input.query,
      transactions: rows.map(shapeTxn),
      count: rows.length,
      data_as_of: getDataAsOf(ctx),
    };
  },
});

/**
 * Trigger an immediate incremental sync and report what changed (ticket 03,
 * user story 7). This is data ingestion, so it is allowed even in read-only
 * mode; it is not audited as a budget write.
 */
export const refreshTool = defineTool({
  name: "refresh",
  description:
    "Pull the latest Accounts and Transactions from Akahu now and report what changed, with an updated data-as-of stamp.",
  inputSchema: {},
  handler: async (ctx) => {
    if (!ctx.syncRunner) {
      throw new Error("Sync is not configured on this server instance.");
    }
    return ctx.syncRunner();
  },
});

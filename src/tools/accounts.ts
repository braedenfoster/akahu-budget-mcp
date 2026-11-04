import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDataAsOf } from "../context.js";
import { accounts, budgetCategories, connections, members } from "../db/schema.js";
import { categoryExists, isSystemCategory, recategorize } from "../categorization/engine.js";
import { formatCents } from "../money.js";
import { withWrite } from "../write.js";
import { defineTool } from "./types.js";

/**
 * List all Accounts across all Connections with balances and Member
 * attribution, plus the standard data-as-of stamp (ticket 02). Read-only.
 */
export const listAccountsTool = defineTool({
  name: "list_accounts",
  description:
    "List every bank Account across all Connections with its balance (integer cents + currency), which Member owns it, and the Budget Category it is linked to as a Savings Account (or null), plus a data-as-of freshness stamp.",
  inputSchema: {},
  handler: (ctx) => {
    const rows = ctx.db
      .select({
        akahuId: accounts.akahuId,
        name: accounts.name,
        type: accounts.type,
        formattedAccount: accounts.formattedAccount,
        balanceCents: accounts.balanceCents,
        currency: accounts.currency,
        memberName: members.name,
        connectionLabel: connections.label,
        savingsCategoryId: budgetCategories.id,
        savingsCategoryName: budgetCategories.name,
      })
      .from(accounts)
      .innerJoin(connections, eq(accounts.connectionId, connections.id))
      .innerJoin(members, eq(connections.memberId, members.id))
      .leftJoin(budgetCategories, eq(accounts.budgetCategoryId, budgetCategories.id))
      .all();

    const accountList = rows.map((r) => ({
      id: r.akahuId,
      name: r.name,
      type: r.type,
      formatted_account: r.formattedAccount,
      balance_cents: r.balanceCents,
      currency: r.currency,
      balance_display: formatCents(r.balanceCents, r.currency),
      member: r.memberName,
      connection: r.connectionLabel,
      savings_category:
        r.savingsCategoryId === null ? null : { id: r.savingsCategoryId, name: r.savingsCategoryName },
    }));

    const totalsByCurrency: Record<string, number> = {};
    for (const r of rows) {
      totalsByCurrency[r.currency] = (totalsByCurrency[r.currency] ?? 0) + r.balanceCents;
    }

    return {
      accounts: accountList,
      total_balance_cents_by_currency: totalsByCurrency,
      data_as_of: getDataAsOf(ctx),
    };
  },
});

/**
 * Link an Account to a Budget Category as a Savings Account, or unlink it
 * (ADR-0012). Paired transfers into a Savings Account then count as spend in
 * that category, and transfers out reduce it. Audited.
 */
export const setSavingsAccountTool = defineTool({
  name: "set_savings_account",
  description:
    "Link an Account to a Budget Category as a Savings Account, or pass budget_category_id=null to unlink it. Internal transfers into a Savings Account then count as spend in that Budget Category and transfers out reduce it, so the Envelope shows net money saved. Interest stays Income. Uncategorized cannot be linked. Audited; refused in read-only mode.",
  inputSchema: {
    account_id: z.string().min(1),
    budget_category_id: z.number().int().nullable(),
  },
  handler: (ctx, input) => {
    const { account_id, budget_category_id } = input;
    const account = ctx.db
      .select({ id: accounts.akahuId })
      .from(accounts)
      .where(eq(accounts.akahuId, account_id))
      .get();
    if (!account) throw new Error(`No account with id ${account_id}.`);
    if (budget_category_id !== null) {
      if (!categoryExists(ctx, budget_category_id))
        throw new Error(`No category with id ${budget_category_id}.`);
      if (isSystemCategory(ctx, budget_category_id))
        throw new Error("Uncategorized cannot be linked to a Savings Account.");
    }
    return withWrite(
      ctx,
      {
        tool: "set_savings_account",
        summary: `savings account ${account_id} -> ${budget_category_id ?? "none"}`,
        payload: { account_id, budget_category_id },
      },
      () => {
        ctx.db
          .update(accounts)
          .set({ budgetCategoryId: budget_category_id })
          .where(eq(accounts.akahuId, account_id))
          .run();
        return { account_id, budget_category_id, recategorized: recategorize(ctx) };
      },
    );
  },
});

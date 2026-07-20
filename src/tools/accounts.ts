import { eq } from "drizzle-orm";
import { getDataAsOf } from "../context.js";
import { accounts, connections, members } from "../db/schema.js";
import { formatCents } from "../money.js";
import { defineTool } from "./types.js";

/**
 * List all Accounts across all Connections with balances and Member
 * attribution, plus the standard data-as-of stamp (ticket 02). Read-only.
 */
export const listAccountsTool = defineTool({
  name: "list_accounts",
  description:
    "List every bank Account across all Connections with its balance (integer cents + currency) and which Member owns it, plus a data-as-of freshness stamp.",
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
      })
      .from(accounts)
      .innerJoin(connections, eq(accounts.connectionId, connections.id))
      .innerJoin(members, eq(connections.memberId, members.id))
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

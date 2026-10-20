import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDataAsOf, householdToday, type AppContext } from "../context.js";
import { computeBillsView, DUE_DAYS, OVERDUE_DAYS, WEEK_AHEAD_DAYS, WEEK_BEHIND_DAYS } from "../bills/view.js";
import { BILL_CADENCES, bills, type Bill, type BillCadence } from "../db/schema.js";
import { MATCH_TYPES } from "../matching/matcher.js";
import { formatDollars } from "../money.js";
import { withWrite } from "../write.js";
import { calendarDateSchema } from "./schemas.js";
import { defineTool } from "./types.js";

// Index order matches the stored anchor_weekday: 0 = Sunday.
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
type Weekday = (typeof WEEKDAYS)[number];

const ANCHOR_FIELDS = ["weekday", "day_of_month", "anchor_date"] as const;
type AnchorField = (typeof ANCHOR_FIELDS)[number];

const ANCHOR_FIELD_BY_CADENCE: Record<BillCadence, AnchorField> = {
  weekly: "weekday",
  fortnightly: "anchor_date",
  monthly: "day_of_month",
  quarterly: "anchor_date",
  yearly: "anchor_date",
};

interface AnchorInput {
  weekday?: Weekday;
  day_of_month?: number;
  anchor_date?: string;
}

function shapeBill(b: Bill) {
  return {
    id: b.id,
    name: b.name,
    cadence: b.cadence,
    weekday: b.anchorWeekday === null ? null : WEEKDAYS[b.anchorWeekday]!,
    day_of_month: b.anchorDay,
    anchor_date: b.anchorDate,
    amount_mode: b.amountMode,
    expected_amount_cents: b.expectedAmountCents,
    expected_amount_display: formatDollars(b.expectedAmountCents),
    match_type: b.matchType,
    match_value: b.matchValue,
    status: b.status,
    end_date: b.endDate,
  };
}

function getActiveBill(ctx: AppContext, id: number): Bill {
  const bill = ctx.db.select().from(bills).where(eq(bills.id, id)).get();
  if (!bill) throw new Error(`No Bill with id ${id}.`);
  if (bill.status === "ended") throw new Error(`Bill ${id} (${bill.name}) is ended.`);
  return bill;
}

/**
 * The anchor columns for a cadence. Each cadence takes exactly one anchor field.
 * An edit keeps the current anchor when the new cadence takes the same field.
 */
function anchorColumns(cadence: BillCadence, given: AnchorInput, current?: Bill) {
  const field = ANCHOR_FIELD_BY_CADENCE[cadence];
  const wrong = ANCHOR_FIELDS.find((f) => f !== field && given[f] !== undefined);
  if (wrong) throw new Error(`${cadence} Bills take \`${field}\`, not \`${wrong}\`.`);
  const kept = current && ANCHOR_FIELD_BY_CADENCE[current.cadence] === field ? shapeBill(current)[field] : null;
  const value = given[field] ?? kept;
  if (value === null || value === undefined) throw new Error(`${cadence} Bills need \`${field}\`.`);
  return {
    anchorWeekday: field === "weekday" ? WEEKDAYS.indexOf(value as Weekday) : null,
    anchorDay: field === "day_of_month" ? (value as number) : null,
    anchorDate: field === "anchor_date" ? (value as string) : null,
  };
}

export const manageBillsTool = defineTool({
  name: "manage_bills",
  description:
    "Create, edit or end a Bill: a repeating, expected Household debit. " +
    "create: {name, cadence, anchor, expected_amount_cents, match_type, match_value}. " +
    "The anchor depends on the cadence: weekly takes `weekday`; monthly takes `day_of_month` (1-31, moved to the last day of a shorter month); " +
    "fortnightly, quarterly and yearly take `anchor_date` (YYYY-MM-DD, any one due date). " +
    "match_type is one of merchant (exact), description (substring), akahu_group (exact), txn_type (exact Akahu type, e.g. LOAN). " +
    "edit: {id, any of the create fields}; a new cadence needs its own anchor field unless it shares the old one. " +
    "end: {id, end_date?}; end_date defaults to today, and the Bill has no due dates after it. Ended Bills cannot be edited. " +
    "Audited; refused in read-only mode.",
  inputSchema: {
    action: z.enum(["create", "edit", "end"]),
    id: z.number().int().optional(),
    name: z.string().min(1).optional(),
    cadence: z.enum(BILL_CADENCES).optional(),
    weekday: z.enum(WEEKDAYS).optional(),
    day_of_month: z.number().int().min(1).max(31).optional(),
    anchor_date: calendarDateSchema.optional(),
    expected_amount_cents: z.number().int().min(1).optional(),
    match_type: z.enum(MATCH_TYPES).optional(),
    match_value: z.string().min(1).optional(),
    end_date: calendarDateSchema.optional(),
  },
  handler: (ctx, input) => {
    if (input.action === "create") {
      const { name, cadence, expected_amount_cents, match_type, match_value } = input;
      if (!name || !cadence || expected_amount_cents === undefined || !match_type || !match_value)
        throw new Error("create requires `name`, `cadence`, `expected_amount_cents`, `match_type` and `match_value`.");
      const anchor = anchorColumns(cadence, input);
      return withWrite(ctx, { tool: "manage_bills", summary: `create bill ${name}`, payload: input }, () => {
        const now = ctx.now().toISOString();
        const created = ctx.db
          .insert(bills)
          .values({
            name,
            cadence,
            ...anchor,
            expectedAmountCents: expected_amount_cents,
            matchType: match_type,
            matchValue: match_value,
            createdAt: now,
            updatedAt: now,
          })
          .returning()
          .get();
        return shapeBill(created);
      });
    }

    if (input.id === undefined) throw new Error(`${input.action} requires \`id\`.`);
    const bill = getActiveBill(ctx, input.id);

    if (input.action === "edit") {
      const cadence = input.cadence ?? bill.cadence;
      const anchor = anchorColumns(cadence, input, bill);
      return withWrite(
        ctx,
        { tool: "manage_bills", summary: `edit bill ${bill.id} ${bill.name}`, payload: input },
        () =>
          shapeBill(
            ctx.db
              .update(bills)
              .set({
                name: input.name,
                cadence,
                ...anchor,
                expectedAmountCents: input.expected_amount_cents,
                matchType: input.match_type,
                matchValue: input.match_value,
                updatedAt: ctx.now().toISOString(),
              })
              .where(eq(bills.id, bill.id))
              .returning()
              .get()!,
          ),
      );
    }

    const endDate = input.end_date ?? householdToday(ctx);
    return withWrite(
      ctx,
      { tool: "manage_bills", summary: `end bill ${bill.id} ${bill.name} on ${endDate}`, payload: input },
      () =>
        shapeBill(
          ctx.db
            .update(bills)
            .set({ status: "ended", endDate, updatedAt: ctx.now().toISOString() })
            .where(eq(bills.id, bill.id))
            .returning()
            .get()!,
        ),
    );
  },
});

export const listBillsTool = defineTool({
  name: "list_bills",
  description:
    "List the Household's active Bills by name, with cadence, anchor, expected amount and matcher rule. Set include_ended to also list ended Bills. Read-only with data-as-of.",
  inputSchema: { include_ended: z.boolean().default(false) },
  handler: (ctx, input) => ({
    bills: ctx.db
      .select()
      .from(bills)
      .where(input.include_ended ? undefined : eq(bills.status, "active"))
      .orderBy(asc(bills.name))
      .all()
      .map(shapeBill),
    data_as_of: getDataAsOf(ctx),
  }),
});

export const getUpcomingBillsTool = defineTool({
  name: "get_upcoming_bills",
  description:
    `The Bills view, the same one the phone shows. \`occurrences\` lists each Bill occurrence due from ${WEEK_BEHIND_DAYS} days ago to ${WEEK_AHEAD_DAYS} days ahead, overdue first, then by due date, ` +
    `with its state: upcoming (due date ahead), due (due today or up to ${DUE_DAYS} days ago), overdue (up to ${OVERDUE_DAYS} days ago). ` +
    "`today` holds the occurrences due on or before today. `next_upcoming` is the first occurrence after today, even past the week. " +
    "`due_total_cents` sums the occurrences in the list. Dates are Household calendar dates. Read-only with data-as-of and stale.",
  inputSchema: {},
  handler: (ctx) => computeBillsView(ctx, householdToday(ctx)),
});

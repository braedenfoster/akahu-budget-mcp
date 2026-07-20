import { and, eq } from "drizzle-orm";
import type { AppConfig } from "./config.js";
import type { AppContext } from "./context.js";
import { connections, households, members } from "./db/schema.js";

/**
 * Household/Member/Connection are derived from config at startup — this is
 * system initialisation, not a user mutation, so it does not flow through the
 * write wrapper. Idempotent: safe to run on every boot.
 */

export function ensureHousehold(ctx: AppContext, name = "Household"): number {
  const existing = ctx.db.select({ id: households.id }).from(households).get();
  if (existing) return existing.id;
  const created = ctx.db
    .insert(households)
    .values({ name, createdAt: ctx.now().toISOString() })
    .returning({ id: households.id })
    .get();
  return created.id;
}

export function ensureMember(ctx: AppContext, householdId: number, name: string): number {
  const existing = ctx.db
    .select({ id: members.id })
    .from(members)
    .where(and(eq(members.householdId, householdId), eq(members.name, name)))
    .get();
  if (existing) return existing.id;
  const created = ctx.db
    .insert(members)
    .values({ householdId, name, createdAt: ctx.now().toISOString() })
    .returning({ id: members.id })
    .get();
  return created.id;
}

export function ensureConnection(
  ctx: AppContext,
  args: { memberId: number; akahuIndex: number; label: string },
): number {
  const existing = ctx.db
    .select({ id: connections.id })
    .from(connections)
    .where(eq(connections.akahuIndex, args.akahuIndex))
    .get();
  if (existing) return existing.id;
  const created = ctx.db
    .insert(connections)
    .values({
      memberId: args.memberId,
      akahuIndex: args.akahuIndex,
      label: args.label,
      createdAt: ctx.now().toISOString(),
    })
    .returning({ id: connections.id })
    .get();
  return created.id;
}

export interface SeededConnection {
  connectionId: number;
  akahuIndex: number;
  memberName: string;
}

/**
 * Reconcile the Household graph with the configured Akahu Connections. Returns
 * the connection rows (with their env index) so the caller can pair each with a
 * live AkahuClient built from the matching tokens.
 */
export function seedHouseholdFromConfig(
  ctx: AppContext,
  config: AppConfig,
): SeededConnection[] {
  const householdId = ensureHousehold(ctx);
  return config.connections.map((conn) => {
    const memberId = ensureMember(ctx, householdId, conn.memberName);
    const connectionId = ensureConnection(ctx, {
      memberId,
      akahuIndex: conn.index,
      label: `${conn.memberName} — Akahu ${conn.index}`,
    });
    return { connectionId, akahuIndex: conn.index, memberName: conn.memberName };
  });
}

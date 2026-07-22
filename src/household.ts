import { and, asc, eq, sql } from "drizzle-orm";
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

// --- Phase-2 email → Member mapping (ADR-0010) -----------------------------

/**
 * Attach the configured emails to Members (the Phase-2 allowlist). Runs at
 * startup outside the write wrapper — system initialisation, like the household
 * seed above. A configured Member that has no Connection is created here so an
 * auth-only Member (e.g. a ChatGPT user without an Akahu account) can be mapped.
 * Idempotent: config is the source of truth, so we overwrite on each boot.
 */
export function seedMemberEmailsFromConfig(ctx: AppContext, config: AppConfig): void {
  if (config.memberEmails.length === 0) return;
  const householdId = ensureHousehold(ctx);
  for (const { name, email } of config.memberEmails) {
    const memberId = ensureMember(ctx, householdId, name);
    ctx.db.update(members).set({ email }).where(eq(members.id, memberId)).run();
  }
}

/**
 * Resolve an authenticated email to a Member id, case-insensitively (ADR-0010).
 * Returns undefined when no Member carries that email — the caller turns that
 * into a 403.
 */
export function findMemberByEmail(ctx: AppContext, email: string): number | undefined {
  const row = ctx.db
    .select({ id: members.id })
    .from(members)
    .where(sql`lower(${members.email}) = lower(${email})`)
    .get();
  return row?.id;
}

/**
 * The Member the OAuth-free tailnet path is attributed to (ADR-0010). Uses the
 * configured `TAILNET_DEFAULT_MEMBER` name when it matches a Member; otherwise
 * (unset, or no match) falls back to the first seeded Member. Undefined only
 * when no Members exist at all.
 */
export function resolveTailnetDefaultMember(
  ctx: AppContext,
  config: AppConfig,
): number | undefined {
  if (config.tailnetDefaultMember) {
    const household = ctx.db.select({ id: households.id }).from(households).get();
    if (household) {
      const named = ctx.db
        .select({ id: members.id })
        .from(members)
        .where(
          and(
            eq(members.householdId, household.id),
            eq(members.name, config.tailnetDefaultMember),
          ),
        )
        .get();
      if (named) return named.id;
      console.warn(
        `TAILNET_DEFAULT_MEMBER="${config.tailnetDefaultMember}" matches no Member; ` +
          `falling back to the first seeded Member.`,
      );
    }
  }
  const first = ctx.db
    .select({ id: members.id })
    .from(members)
    .orderBy(asc(members.id))
    .get();
  return first?.id;
}

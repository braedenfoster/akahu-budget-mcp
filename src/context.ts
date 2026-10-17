import { eq } from "drizzle-orm";
import type { Db } from "./db/index.js";
import { settings } from "./db/schema.js";
import type { SyncResult } from "./sync/result.js";

/**
 * Who a mutating request is attributed to (ADR-0010). `tailnet` requests come in
 * over the OAuth-free tailnet listener and are pinned to a configured default
 * Member; `oauth` requests carry a Stytch-validated email resolved to a Member.
 * Undefined when no actor is known (e.g. a deployment with no Members seeded).
 */
export interface Actor {
  memberId: number;
  source: "tailnet" | "oauth";
}

/**
 * Everything a tool handler needs, injected rather than reached for. The clock
 * (`now`) is injectable so Seam 1 tests are deterministic (ADR-0003 testing).
 */
export interface AppContext {
  db: Db;
  /** Current instant. Overridable in tests for deterministic date logic. */
  now: () => Date;
  /**
   * Triggers a live Akahu sync. Injected at startup with real clients; the
   * `refresh` tool calls it. Undefined in unit tests that don't exercise sync.
   */
  syncRunner?: () => Promise<SyncResult>;
  /**
   * The Member this request is attributed to, stamped onto audit rows by the
   * write wrapper (ADR-0010). Undefined = no attribution (system writes, or a
   * deployment without Members). Set per-request via {@link withActor}.
   */
  actor?: Actor;
}

/** Build a context with a real wall clock. Tests pass their own `now`. */
export function makeContext(
  db: Db,
  now: () => Date = () => new Date(),
  syncRunner?: AppContext["syncRunner"],
): AppContext {
  return { db, now, syncRunner };
}

/**
 * Clone a context with a request-scoped actor (ADR-0010). The base context is
 * built once at startup; each `/mcp` request derives its own actor-stamped
 * context so concurrent requests never share attribution state.
 */
export function withActor(ctx: AppContext, actor: Actor | undefined): AppContext {
  return { ...ctx, actor };
}

// --- Settings accessors -----------------------------------------------------

export const SETTING_READ_ONLY = "read_only";
export const SETTING_BUDGET_MONTH_START_DAY = "budget_month_start_day";
export const SETTING_LAST_SYNC_AT = "last_sync_at";
export const SETTING_HOME_CURRENCY = "home_currency";
export const SETTING_HOUSEHOLD_TIMEZONE = "household_timezone";
const DEFAULT_HOUSEHOLD_TIMEZONE = "Pacific/Auckland";

export function getSetting(ctx: AppContext, key: string): string | undefined {
  const row = ctx.db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, key))
    .get();
  return row?.value;
}

/** Upsert a setting. Callers that mutate must route through the write wrapper. */
export function putSetting(ctx: AppContext, key: string, value: string): void {
  const updatedAt = ctx.now().toISOString();
  ctx.db
    .insert(settings)
    .values({ key, value, updatedAt })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt } })
    .run();
}

export function isReadOnly(ctx: AppContext): boolean {
  return getSetting(ctx, SETTING_READ_ONLY) === "true";
}

/** Day of month a Period begins (ADR-0004). Default 1. Clamped to [1, 28]. */
export function budgetMonthStartDay(ctx: AppContext): number {
  const raw = getSetting(ctx, SETTING_BUDGET_MONTH_START_DAY);
  const n = raw ? Number.parseInt(raw, 10) : 1;
  if (!Number.isInteger(n) || n < 1 || n > 28) return 1;
  return n;
}

/**
 * IANA time zone for the Spending allowance's local today (ADR-0011). Default
 * Pacific/Auckland; an unknown zone falls back to it. Other tools keep UTC
 * Period resolution.
 */
export function householdTimezone(ctx: AppContext): string {
  const raw = getSetting(ctx, SETTING_HOUSEHOLD_TIMEZONE);
  if (!raw) return DEFAULT_HOUSEHOLD_TIMEZONE;
  try {
    new Intl.DateTimeFormat("en-NZ", { timeZone: raw });
    return raw;
  } catch {
    return DEFAULT_HOUSEHOLD_TIMEZONE;
  }
}

/**
 * The freshness stamp attached to every read (ADR-0005). Reflects the last
 * successful Akahu sync; null until the first sync has run.
 */
export function getDataAsOf(ctx: AppContext): string | null {
  return getSetting(ctx, SETTING_LAST_SYNC_AT) ?? null;
}

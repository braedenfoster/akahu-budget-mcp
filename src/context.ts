import { eq } from "drizzle-orm";
import type { Db } from "./db/index.js";
import { settings } from "./db/schema.js";
import type { SyncResult } from "./sync/result.js";

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
}

/** Build a context with a real wall clock. Tests pass their own `now`. */
export function makeContext(
  db: Db,
  now: () => Date = () => new Date(),
  syncRunner?: AppContext["syncRunner"],
): AppContext {
  return { db, now, syncRunner };
}

// --- Settings accessors -----------------------------------------------------

export const SETTING_READ_ONLY = "read_only";
export const SETTING_BUDGET_MONTH_START_DAY = "budget_month_start_day";
export const SETTING_LAST_SYNC_AT = "last_sync_at";
export const SETTING_HOME_CURRENCY = "home_currency";

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
 * The freshness stamp attached to every read (ADR-0005). Reflects the last
 * successful Akahu sync; null until the first sync has run.
 */
export function getDataAsOf(ctx: AppContext): string | null {
  return getSetting(ctx, SETTING_LAST_SYNC_AT) ?? null;
}

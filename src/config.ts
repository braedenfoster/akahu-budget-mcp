import { DEFAULT_CURRENCY } from "./money.js";

/**
 * Process configuration, read from the environment (loaded from `.env` via
 * dotenv at startup). Secrets (Akahu tokens) live here in memory only and are
 * never logged or returned by any tool.
 */
export interface AkahuConnectionConfig {
  /** Stable label for the Connection, derived from the env index. */
  index: number;
  /** Display name of the Member who owns this Connection. */
  memberName: string;
  appToken: string;
  userToken: string;
}

export interface AppConfig {
  databasePath: string;
  host: string;
  port: number;
  readOnly: boolean;
  homeCurrency: string;
  budgetMonthStartDay: number | undefined;
  /** node-cron expression for the nightly sync (ADR-0005). */
  syncCron: string;
  connections: AkahuConnectionConfig[];
}

function parseConnections(env: NodeJS.ProcessEnv): AkahuConnectionConfig[] {
  const connections: AkahuConnectionConfig[] = [];
  // Discover AKAHU_APP_TOKEN_1 / AKAHU_USER_TOKEN_1 / AKAHU_MEMBER_NAME_1, ...
  for (let i = 1; i <= 20; i++) {
    const appToken = env[`AKAHU_APP_TOKEN_${i}`];
    const userToken = env[`AKAHU_USER_TOKEN_${i}`];
    if (!appToken || !userToken) continue;
    connections.push({
      index: i,
      memberName: env[`AKAHU_MEMBER_NAME_${i}`] ?? `Member ${i}`,
      appToken,
      userToken,
    });
  }
  return connections;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const startDay = env.BUDGET_MONTH_START_DAY
    ? Number.parseInt(env.BUDGET_MONTH_START_DAY, 10)
    : undefined;
  return {
    databasePath: env.DATABASE_PATH ?? "./data/budget.sqlite",
    host: env.HOST ?? "127.0.0.1",
    port: env.PORT ? Number.parseInt(env.PORT, 10) : 3000,
    readOnly: env.READ_ONLY === "true",
    homeCurrency: env.HOME_CURRENCY ?? DEFAULT_CURRENCY,
    budgetMonthStartDay: Number.isInteger(startDay) ? startDay : undefined,
    syncCron: env.SYNC_CRON ?? "0 2 * * *",
    connections: parseConnections(env),
  };
}

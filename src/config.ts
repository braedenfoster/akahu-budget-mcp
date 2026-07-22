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

/**
 * Phase-2 OAuth Resource-Server config (ADR-0010). Present only when the public
 * listener is enabled. Stytch is the Authorization Server; we validate its JWTs.
 * No secrets live here — validation is public-key (JWKS) only.
 */
export interface AuthConfig {
  /** Stytch project id, for operator diagnostics and JWKS derivation. */
  projectId: string;
  /** Expected `iss` claim (also the default Authorization Server). */
  issuer: string;
  /** Expected `aud` claim; doubles as the default RFC 9728 resource id. */
  audience: string;
  /** Canonical resource identifier advertised in metadata. Defaults to audience. */
  resource: string;
  /** JWKS endpoint. Defaults to `${issuer}/.well-known/jwks.json`. */
  jwksUrl: string;
  /** Token claim carrying the authenticated email. Default `email`. */
  emailClaim: string;
  /** Authorization Servers advertised in metadata. Default `[issuer]`. */
  authorizationServers: string[];
}

/** A configured email→Member mapping entry (the Phase-2 allowlist). */
export interface MemberEmailConfig {
  name: string;
  email: string;
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
  /** Public (OAuth-guarded) listener port. Undefined ⇒ Phase 2 off (ADR-0010). */
  publicPort: number | undefined;
  /** OAuth config; present iff `publicPort` is set. */
  auth: AuthConfig | undefined;
  /** `Name:email` pairs mapping an authenticated email to a Member. */
  memberEmails: MemberEmailConfig[];
  /** Member name attributed to the tailnet path; default = first seeded Member. */
  tailnetDefaultMember: string | undefined;
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

/**
 * Parse `PUBLIC_PORT`. Unset/blank ⇒ Phase 2 off. A set-but-invalid value throws
 * (fail-fast, ADR-0010): a garbled port must not silently disable public
 * exposure the operator asked for.
 */
function parsePublicPort(raw: string | undefined): number | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) return undefined;
  const port = Number(trimmed);
  if (!/^\d+$/.test(trimmed) || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PUBLIC_PORT="${raw}" is not a valid TCP port (1..65535).`);
  }
  return port;
}

/** Parse `Name:email,Name:email` into pairs. Blank/malformed entries are skipped. */
function parseMemberEmails(raw: string | undefined): MemberEmailConfig[] {
  if (!raw) return [];
  const pairs: MemberEmailConfig[] = [];
  for (const entry of raw.split(",")) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const colon = trimmed.indexOf(":");
    if (colon <= 0) continue; // need a non-empty name and a separator
    const name = trimmed.slice(0, colon).trim();
    const email = trimmed.slice(colon + 1).trim();
    if (name && email) pairs.push({ name, email });
  }
  return pairs;
}

/**
 * Build the Phase-2 auth config from the environment. Fail-fast (ADR-0010): if
 * the public listener is enabled but the required Stytch trio is missing, throw
 * at startup rather than serve an unprotected public port. No secret is read or
 * logged — validation is public-key only.
 */
function parseAuth(env: NodeJS.ProcessEnv, publicPort: number | undefined): AuthConfig | undefined {
  if (publicPort === undefined) return undefined;

  const projectId = env.STYTCH_PROJECT_ID?.trim();
  const issuer = env.AUTH_ISSUER?.trim();
  const audience = env.AUTH_AUDIENCE?.trim();
  const missing: string[] = [];
  if (!projectId) missing.push("STYTCH_PROJECT_ID");
  if (!issuer) missing.push("AUTH_ISSUER");
  if (!audience) missing.push("AUTH_AUDIENCE");
  if (missing.length > 0) {
    throw new Error(
      `PUBLIC_PORT is set but Phase-2 OAuth config is incomplete: missing ${missing.join(", ")}. ` +
        `Set them or unset PUBLIC_PORT to run the tailnet-only V1 (ADR-0010).`,
    );
  }

  const resolvedIssuer = issuer!;
  return {
    projectId: projectId!,
    issuer: resolvedIssuer,
    audience: audience!,
    resource: env.AUTH_RESOURCE?.trim() || audience!,
    jwksUrl:
      env.STYTCH_JWKS_URL?.trim() ||
      `${resolvedIssuer.replace(/\/$/, "")}/.well-known/jwks.json`,
    emailClaim: env.AUTH_EMAIL_CLAIM?.trim() || "email",
    authorizationServers: [resolvedIssuer],
  };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const startDay = env.BUDGET_MONTH_START_DAY
    ? Number.parseInt(env.BUDGET_MONTH_START_DAY, 10)
    : undefined;
  const publicPort = parsePublicPort(env.PUBLIC_PORT);
  return {
    databasePath: env.DATABASE_PATH ?? "./data/budget.sqlite",
    host: env.HOST ?? "127.0.0.1",
    port: env.PORT ? Number.parseInt(env.PORT, 10) : 3000,
    readOnly: env.READ_ONLY === "true",
    homeCurrency: env.HOME_CURRENCY ?? DEFAULT_CURRENCY,
    budgetMonthStartDay: Number.isInteger(startDay) ? startDay : undefined,
    syncCron: env.SYNC_CRON ?? "0 2 * * *",
    connections: parseConnections(env),
    publicPort,
    auth: parseAuth(env, publicPort),
    memberEmails: parseMemberEmails(env.AUTH_MEMBER_EMAILS),
    tailnetDefaultMember: env.TAILNET_DEFAULT_MEMBER?.trim() || undefined,
  };
}

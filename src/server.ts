import "dotenv/config";
import cron from "node-cron";
import { loadConfig } from "./config.js";
import { makeContext, type Actor } from "./context.js";
import { openAndMigrate } from "./db/index.js";
import { seedSettingsFromConfig } from "./bootstrap.js";
import {
  findMemberByEmail,
  resolveTailnetDefaultMember,
  seedHouseholdFromConfig,
  seedMemberEmailsFromConfig,
} from "./household.js";
import { buildAccountJobs, runSync } from "./sync/index.js";
import { buildMcpApp } from "./http/router.js";
import { makeAuthorizer } from "./auth/authorize.js";
import {
  PROTECTED_RESOURCE_PATH,
  makeAuthenticateMiddleware,
  makeResourceMetadataHandler,
} from "./auth/middleware.js";
import { makeVerifierFromConfig } from "./auth/verify.js";

/**
 * Entry point. Phase 1: an MCP server over Streamable HTTP, reached privately
 * over Tailscale (ADR-0002) with no OAuth — the tailnet is the auth. Phase 2
 * (opt-in via PUBLIC_PORT) binds a second, OAuth-guarded listener that Tailscale
 * Funnel targets (ADR-0010); with no PUBLIC_PORT only the tailnet listener binds
 * and V1 is unaffected. Each POST /mcp is handled statelessly (a fresh server +
 * transport per request), ample for a single always-on household deployment.
 */
async function main(): Promise<void> {
  const config = loadConfig();
  const db = openAndMigrate(config.databasePath);

  const seededHolder: { seeded: ReturnType<typeof seedHouseholdFromConfig> } = {
    seeded: [],
  };
  // The sync runner is injected into the context so the `refresh` tool can
  // trigger a live sync without importing the sync engine (avoids a cycle).
  const syncRunner: NonNullable<
    Parameters<typeof makeContext>[2]
  > = async () => {
    const jobs = buildAccountJobs(seededHolder.seeded, config);
    return runSync(ctx, jobs, config.homeCurrency);
  };
  const ctx = makeContext(db, () => new Date(), syncRunner);

  seedSettingsFromConfig(ctx, config);
  seededHolder.seeded = seedHouseholdFromConfig(ctx, config);
  seedMemberEmailsFromConfig(ctx, config);
  const hasConnections = config.connections.length > 0;

  // Best-effort sync on boot so the first read isn't empty. Never fatal: the Pi
  // may be offline or Akahu unreachable; the nightly cron retries.
  if (hasConnections) {
    syncRunner()
      .then((r) =>
        console.log(
          `Startup sync: ${r.accounts.accountsUpserted} accounts, ` +
            `${r.transactions.inserted}+${r.transactions.updated} transactions`,
        ),
      )
      .catch((err) =>
        console.error("Startup sync failed:", err instanceof Error ? err.message : err),
      );

    // Nightly incremental sync in-process (ADR-0005/0008).
    cron.schedule(config.syncCron, () => {
      syncRunner()
        .then((r) => console.log(`Nightly sync: ${r.transactions.inserted} new transactions`))
        .catch((err) =>
          console.error("Nightly sync failed:", err instanceof Error ? err.message : err),
        );
    });
    console.log(`Nightly sync scheduled: ${config.syncCron}`);
  }

  // --- Tailnet listener (always on, OAuth-free; ADR-0002/0010) -------------
  // Attribute every write on this path to the configured default Member.
  const tailnetMemberId = resolveTailnetDefaultMember(ctx, config);
  const tailnetActor: Actor | undefined =
    tailnetMemberId !== undefined
      ? { memberId: tailnetMemberId, source: "tailnet" }
      : undefined;

  const tailnetApp = buildMcpApp(ctx, { resolveActor: () => tailnetActor });
  tailnetApp.listen(config.port, config.host, () => {
    console.log(
      `akahu-budget-mcp (tailnet) listening on http://${config.host}:${config.port}/mcp ` +
        `(read_only=${config.readOnly}, connections=${config.connections.length})`,
    );
  });

  // --- Public listener (opt-in via PUBLIC_PORT; OAuth-guarded; ADR-0010) ----
  if (config.publicPort !== undefined && config.auth) {
    const auth = config.auth;
    const resourceMetadataUrl = `${auth.resource.replace(/\/$/, "")}${PROTECTED_RESOURCE_PATH}`;
    const authorize = makeAuthorizer({
      verifyToken: makeVerifierFromConfig(auth),
      resolveMember: (email) => findMemberByEmail(ctx, email),
      resourceMetadataUrl,
    });
    const publicApp = buildMcpApp(ctx, {
      authenticate: makeAuthenticateMiddleware(authorize),
      resolveActor: (req) => req.actor,
      wellKnown: {
        path: PROTECTED_RESOURCE_PATH,
        handler: makeResourceMetadataHandler(auth),
      },
    });
    publicApp.listen(config.publicPort, config.host, () => {
      console.log(
        `akahu-budget-mcp (public/oauth) listening on http://${config.host}:${config.publicPort}/mcp ` +
          `— resource server for ${auth.issuer}`,
      );
    });
  }
}

main().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});

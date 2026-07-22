import {
  SignJWT,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type JWK,
} from "jose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig, type AppConfig } from "../src/config.js";
import { withActor } from "../src/context.js";
import { auditLog } from "../src/db/schema.js";
import {
  ensureHousehold,
  ensureMember,
  findMemberByEmail,
  resolveTailnetDefaultMember,
  seedMemberEmailsFromConfig,
} from "../src/household.js";
import { makeAuthorizer } from "../src/auth/authorize.js";
import { makeTokenVerifier } from "../src/auth/verify.js";
import { setSettingTool } from "../src/tools/settings.js";
import { invokeTool } from "../src/tools/types.js";
import { testContext } from "./helpers.js";

const ISSUER = "https://test.stytch.example/oauth";
const AUDIENCE = "https://budget.example.ts.net";
const RESOURCE_METADATA_URL = `${AUDIENCE}/.well-known/oauth-protected-resource`;

/**
 * A local IdP for Seam 1: a generated RSA keypair, a JWKS the verifier can
 * resolve against, and a `sign` helper that mints tokens like Stytch would.
 * `signWith` lets a test sign with a *different* key (bad signature) while
 * keeping the advertised `kid`.
 */
async function makeLocalIdp() {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = { ...(await exportJWK(publicKey)), alg: "RS256", kid: "test-key-1" };
  const jwks = createLocalJWKSet({ keys: [jwk as JWK] });

  async function sign(
    claims: Record<string, unknown>,
    over: {
      issuer?: string;
      audience?: string;
      expSecondsFromNow?: number;
      key?: Awaited<ReturnType<typeof generateKeyPair>>["privateKey"];
    } = {},
  ): Promise<string> {
    // jose validates exp/iat against the real wall clock, so anchor to now.
    const nowSec = Math.floor(Date.now() / 1000);
    return new SignJWT(claims)
      .setProtectedHeader({ alg: "RS256", kid: "test-key-1" })
      .setIssuer(over.issuer ?? ISSUER)
      .setAudience(over.audience ?? AUDIENCE)
      .setIssuedAt(nowSec)
      .setExpirationTime(nowSec + (over.expSecondsFromNow ?? 3600))
      .sign(over.key ?? privateKey);
  }

  const wrongPair = await generateKeyPair("RS256");
  return { jwks, sign, wrongKey: wrongPair.privateKey };
}

function verifierFor(jwks: ReturnType<typeof createLocalJWKSet>) {
  return makeTokenVerifier({ jwks, issuer: ISSUER, audience: AUDIENCE, emailClaim: "email" });
}

describe("ticket 10 — Phase 2 OAuth resource server (Seam 1)", () => {
  describe("token verification + authorization", () => {
    it("a valid token whose email maps to a Member yields an oauth actor", async () => {
      const idp = await makeLocalIdp();
      const authorize = makeAuthorizer({
        verifyToken: verifierFor(idp.jwks),
        resolveMember: (email) => (email === "braeden@example.com" ? 42 : undefined),
        resourceMetadataUrl: RESOURCE_METADATA_URL,
      });

      const token = await idp.sign({ email: "braeden@example.com" });
      const result = await authorize(`Bearer ${token}`);

      expect(result).toEqual({ ok: true, actor: { memberId: 42, source: "oauth" } });
    });

    it("a missing token is 401 with the resource_metadata challenge", async () => {
      const idp = await makeLocalIdp();
      const authorize = makeAuthorizer({
        verifyToken: verifierFor(idp.jwks),
        resolveMember: () => 1,
        resourceMetadataUrl: RESOURCE_METADATA_URL,
      });

      expect(await authorize(undefined)).toMatchObject({
        ok: false,
        status: 401,
        wwwAuthenticate: `Bearer resource_metadata="${RESOURCE_METADATA_URL}"`,
      });
    });

    it("a bad signature is 401", async () => {
      const idp = await makeLocalIdp();
      const authorize = makeAuthorizer({
        verifyToken: verifierFor(idp.jwks),
        resolveMember: () => 1,
        resourceMetadataUrl: RESOURCE_METADATA_URL,
      });

      // Signed with a key not in the JWKS, but advertising the known kid.
      const token = await idp.sign({ email: "braeden@example.com" }, { key: idp.wrongKey });
      expect(await authorize(`Bearer ${token}`)).toMatchObject({ ok: false, status: 401 });
    });

    it("an expired token is 401", async () => {
      const idp = await makeLocalIdp();
      const authorize = makeAuthorizer({
        verifyToken: verifierFor(idp.jwks),
        resolveMember: () => 1,
        resourceMetadataUrl: RESOURCE_METADATA_URL,
      });

      const token = await idp.sign({ email: "braeden@example.com" }, { expSecondsFromNow: -3600 });
      expect(await authorize(`Bearer ${token}`)).toMatchObject({ ok: false, status: 401 });
    });

    it("a wrong-audience token is 401", async () => {
      const idp = await makeLocalIdp();
      const authorize = makeAuthorizer({
        verifyToken: verifierFor(idp.jwks),
        resolveMember: () => 1,
        resourceMetadataUrl: RESOURCE_METADATA_URL,
      });

      const token = await idp.sign(
        { email: "braeden@example.com" },
        { audience: "https://someone-elses-resource.example" },
      );
      expect(await authorize(`Bearer ${token}`)).toMatchObject({ ok: false, status: 401 });
    });

    it("a wrong-issuer token is 401", async () => {
      const idp = await makeLocalIdp();
      const authorize = makeAuthorizer({
        verifyToken: verifierFor(idp.jwks),
        resolveMember: () => 1,
        resourceMetadataUrl: RESOURCE_METADATA_URL,
      });

      const token = await idp.sign(
        { email: "braeden@example.com" },
        { issuer: "https://evil.example/oauth" },
      );
      expect(await authorize(`Bearer ${token}`)).toMatchObject({ ok: false, status: 401 });
    });

    it("a valid token whose email maps to no Member is 403 (no challenge)", async () => {
      const idp = await makeLocalIdp();
      const authorize = makeAuthorizer({
        verifyToken: verifierFor(idp.jwks),
        resolveMember: () => undefined, // the email→Member table is the allowlist
        resourceMetadataUrl: RESOURCE_METADATA_URL,
      });

      const token = await idp.sign({ email: "stranger@example.com" });
      const result = await authorize(`Bearer ${token}`);
      expect(result).toMatchObject({ ok: false, status: 403 });
      expect((result as { wwwAuthenticate?: string }).wwwAuthenticate).toBeUndefined();
    });

    it("a token missing the email claim is 401", async () => {
      const idp = await makeLocalIdp();
      const authorize = makeAuthorizer({
        verifyToken: verifierFor(idp.jwks),
        resolveMember: () => 1,
        resourceMetadataUrl: RESOURCE_METADATA_URL,
      });

      const token = await idp.sign({ sub: "no-email-here" });
      expect(await authorize(`Bearer ${token}`)).toMatchObject({ ok: false, status: 401 });
    });
  });

  describe("email → Member allowlist (case-insensitive)", () => {
    it("matches regardless of case and rejects unknown emails", async () => {
      const ctx = testContext();
      const householdId = ensureHousehold(ctx);
      const braeden = ensureMember(ctx, householdId, "Braeden");
      ensureMember(ctx, householdId, "Partner");
      seedMemberEmailsFromConfig(ctx, {
        ...baseConfig(),
        memberEmails: [
          { name: "Braeden", email: "Braeden@Example.COM" },
          { name: "Partner", email: "partner@example.com" },
        ],
      });

      expect(findMemberByEmail(ctx, "braeden@example.com")).toBe(braeden);
      expect(findMemberByEmail(ctx, "BRAEDEN@EXAMPLE.COM")).toBe(braeden);
      expect(findMemberByEmail(ctx, "nobody@example.com")).toBeUndefined();
    });

    it("creates an auth-only Member configured with no Connection", async () => {
      const ctx = testContext();
      ensureHousehold(ctx);
      seedMemberEmailsFromConfig(ctx, {
        ...baseConfig(),
        memberEmails: [{ name: "ChatGPT User", email: "gpt@example.com" }],
      });
      expect(findMemberByEmail(ctx, "gpt@example.com")).toBeDefined();
    });
  });

  describe("tailnet default Member", () => {
    it("resolves the named member, else the first seeded", async () => {
      const ctx = testContext();
      const householdId = ensureHousehold(ctx);
      const first = ensureMember(ctx, householdId, "Braeden");
      const partner = ensureMember(ctx, householdId, "Partner");

      expect(resolveTailnetDefaultMember(ctx, { ...baseConfig(), tailnetDefaultMember: "Partner" })).toBe(partner);
      expect(resolveTailnetDefaultMember(ctx, { ...baseConfig(), tailnetDefaultMember: undefined })).toBe(first);
      // Unknown name falls back to the first seeded Member.
      expect(resolveTailnetDefaultMember(ctx, { ...baseConfig(), tailnetDefaultMember: "Ghost" })).toBe(first);
    });
  });

  describe("audit attribution", () => {
    it("an oauth-actor write records actor_member_id + source='oauth'", () => {
      const ctx = testContext();
      const householdId = ensureHousehold(ctx);
      const memberId = ensureMember(ctx, householdId, "Braeden");

      const reqCtx = withActor(ctx, { memberId, source: "oauth" });
      invokeTool(reqCtx, setSettingTool, { key: "foo", value: "bar" });

      const row = ctx.db.select().from(auditLog).all().at(-1)!;
      expect(row).toMatchObject({
        tool: "set_setting",
        actorMemberId: memberId,
        actorSource: "oauth",
      });
    });

    it("a tailnet-actor write records the default Member + source='tailnet'", () => {
      const ctx = testContext();
      const householdId = ensureHousehold(ctx);
      const memberId = ensureMember(ctx, householdId, "Braeden");

      const reqCtx = withActor(ctx, { memberId, source: "tailnet" });
      invokeTool(reqCtx, setSettingTool, { key: "foo", value: "bar" });

      const row = ctx.db.select().from(auditLog).all().at(-1)!;
      expect(row).toMatchObject({ actorMemberId: memberId, actorSource: "tailnet" });
    });

    it("a write with no actor records null attribution (V1 unchanged)", () => {
      const ctx = testContext();
      invokeTool(ctx, setSettingTool, { key: "foo", value: "bar" });

      const row = ctx.db.select().from(auditLog).all().at(-1)!;
      expect(row.actorMemberId).toBeNull();
      expect(row.actorSource).toBeNull();
    });
  });

  describe("no token or secret is logged", () => {
    let spies: ReturnType<typeof vi.spyOn>[];
    const lines: string[] = [];

    beforeEach(() => {
      lines.length = 0;
      const capture = (...args: unknown[]) => void lines.push(args.map(String).join(" "));
      spies = [
        vi.spyOn(console, "log").mockImplementation(capture),
        vi.spyOn(console, "warn").mockImplementation(capture),
        vi.spyOn(console, "error").mockImplementation(capture),
      ];
    });
    afterEach(() => spies.forEach((s) => s.mockRestore()));

    it("an invalid token never appears in any log line", async () => {
      const idp = await makeLocalIdp();
      const authorize = makeAuthorizer({
        verifyToken: verifierFor(idp.jwks),
        resolveMember: () => 1,
        resourceMetadataUrl: RESOURCE_METADATA_URL,
      });

      const token = await idp.sign({ email: "braeden@example.com" }, { key: idp.wrongKey });
      const result = await authorize(`Bearer ${token}`);

      expect(result.ok).toBe(false);
      const haystack = [...lines, JSON.stringify(result)].join("\n");
      expect(haystack).not.toContain(token);
    });
  });

  describe("fail-fast config (ADR-0010)", () => {
    it("throws when PUBLIC_PORT is set but the Stytch trio is missing", () => {
      expect(() =>
        loadConfig({ PUBLIC_PORT: "3443" } as NodeJS.ProcessEnv),
      ).toThrow(/PUBLIC_PORT is set but Phase-2 OAuth config is incomplete/);
    });

    it("builds auth config with derived defaults when the trio is present", () => {
      const config = loadConfig({
        PUBLIC_PORT: "3443",
        STYTCH_PROJECT_ID: "project-test-123",
        AUTH_ISSUER: "https://acme.stytch.example/oauth",
        AUTH_AUDIENCE: "https://budget.example.ts.net",
      } as NodeJS.ProcessEnv);

      expect(config.publicPort).toBe(3443);
      expect(config.auth).toMatchObject({
        projectId: "project-test-123",
        issuer: "https://acme.stytch.example/oauth",
        audience: "https://budget.example.ts.net",
        resource: "https://budget.example.ts.net",
        jwksUrl: "https://acme.stytch.example/oauth/.well-known/jwks.json",
        emailClaim: "email",
        authorizationServers: ["https://acme.stytch.example/oauth"],
      });
    });

    it("throws on a set-but-invalid PUBLIC_PORT rather than silently disabling", () => {
      expect(() => loadConfig({ PUBLIC_PORT: "not-a-port" } as NodeJS.ProcessEnv)).toThrow(
        /not a valid TCP port/,
      );
      expect(() => loadConfig({ PUBLIC_PORT: "99999" } as NodeJS.ProcessEnv)).toThrow(
        /not a valid TCP port/,
      );
    });

    it("no PUBLIC_PORT ⇒ Phase 2 off, auth undefined (V1 unaffected)", () => {
      const config = loadConfig({} as NodeJS.ProcessEnv);
      expect(config.publicPort).toBeUndefined();
      expect(config.auth).toBeUndefined();
    });

    it("parses AUTH_MEMBER_EMAILS Name:email pairs", () => {
      const config = loadConfig({
        AUTH_MEMBER_EMAILS: "Braeden:braeden@example.com, Partner:partner@example.com",
      } as NodeJS.ProcessEnv);
      expect(config.memberEmails).toEqual([
        { name: "Braeden", email: "braeden@example.com" },
        { name: "Partner", email: "partner@example.com" },
      ]);
    });
  });
});

/** A minimal AppConfig for the seeding/resolution helpers (Phase 2 off). */
function baseConfig(): AppConfig {
  return {
    databasePath: ":memory:",
    host: "127.0.0.1",
    port: 3000,
    readOnly: false,
    homeCurrency: "NZD",
    budgetMonthStartDay: undefined,
    syncCron: "0 2 * * *",
    connections: [],
    publicPort: undefined,
    auth: undefined,
    memberEmails: [],
    tailnetDefaultMember: undefined,
  };
}

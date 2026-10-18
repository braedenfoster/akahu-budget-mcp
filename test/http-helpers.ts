import type { AddressInfo } from "node:net";
import { eq } from "drizzle-orm";
import type { Express } from "express";
import { makeAuthorizer } from "../src/auth/authorize.js";
import type { AuthConfig } from "../src/config.js";
import type { AppContext } from "../src/context.js";
import { members } from "../src/db/schema.js";
import { ensureHousehold, ensureMember, findMemberByEmail } from "../src/household.js";
import { buildPublicApp } from "../src/http/router.js";

export const TEST_AUTH: AuthConfig = {
  projectId: "project-test",
  issuer: "https://test.stytch.example/oauth",
  audience: "https://budget.example.ts.net",
  resource: "https://budget.example.ts.net",
  jwksUrl: "https://test.stytch.example/oauth/.well-known/jwks.json",
  emailClaim: "email",
  authorizationServers: ["https://test.stytch.example/oauth"],
};

export const MEMBER_EMAIL = "me@example.com";
export const MEMBER_BEARER = "Bearer member-token";
export const STRANGER_BEARER = "Bearer stranger-token";

const TOKEN_EMAILS: Record<string, string> = {
  "member-token": MEMBER_EMAIL,
  "stranger-token": "stranger@example.com",
};

/**
 * The public listener with the real authorizer and email→Member lookup. Only
 * the JWT verifier is stubbed: MEMBER_BEARER resolves to MEMBER_EMAIL, which
 * this helper attaches to the named Member, and STRANGER_BEARER resolves to an
 * email no Member carries.
 */
export function publicTestApp(ctx: AppContext, memberName = "Me"): Express {
  const memberId = ensureMember(ctx, ensureHousehold(ctx), memberName);
  ctx.db.update(members).set({ email: MEMBER_EMAIL }).where(eq(members.id, memberId)).run();
  const authorize = makeAuthorizer({
    verifyToken: async (token) => {
      const email = TOKEN_EMAILS[token];
      if (!email) throw new Error("unknown token");
      return { email };
    },
    resolveMember: (email) => findMemberByEmail(ctx, email),
    resourceMetadataUrl: `${TEST_AUTH.resource}/.well-known/oauth-protected-resource`,
  });
  return buildPublicApp(ctx, { authorize, auth: TEST_AUTH });
}

/** Serve the app on an ephemeral port for one GET. The body is parsed JSON, or undefined if not JSON. */
export async function getOnce(
  app: Express,
  path: string,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: unknown }> {
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}${path}`, { headers });
    const text = await res.text();
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      body = undefined;
    }
    return { status: res.status, body };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

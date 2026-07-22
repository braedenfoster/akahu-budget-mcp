import type { Actor } from "../context.js";
import type { TokenVerifier } from "./verify.js";

/**
 * The Resource-Server authorization decision, framed so it can be unit-tested
 * without express (ADR-0010 Seam 1). Given the raw `Authorization` header it
 * returns either the resolved actor or the HTTP status the caller should send.
 *
 *   - Missing / invalid token ⇒ 401 with a `WWW-Authenticate` challenge that
 *     points MCP clients at our RFC 9728 metadata.
 *   - Valid token whose email maps to no Member ⇒ 403 (the email→Member table
 *     is the allowlist; re-authenticating won't help, so no challenge header).
 */
export type AuthResult =
  | { ok: true; actor: Actor }
  | { ok: false; status: 401 | 403; message: string; wwwAuthenticate?: string };

export type Authorizer = (authorizationHeader: string | undefined) => Promise<AuthResult>;

export function makeAuthorizer(opts: {
  verifyToken: TokenVerifier;
  resolveMember: (email: string) => number | undefined;
  resourceMetadataUrl: string;
}): Authorizer {
  const challenge = `Bearer resource_metadata="${opts.resourceMetadataUrl}"`;
  return async (header) => {
    const token = extractBearer(header);
    if (!token) {
      return { ok: false, status: 401, message: "Missing bearer token", wwwAuthenticate: challenge };
    }

    let email: string;
    try {
      ({ email } = await opts.verifyToken(token));
    } catch {
      // Never echo the token or the raw verify error (it can embed token bits).
      return { ok: false, status: 401, message: "Invalid token", wwwAuthenticate: challenge };
    }

    const memberId = opts.resolveMember(email);
    if (memberId === undefined) {
      return { ok: false, status: 403, message: "Authenticated email is not attached to a Member" };
    }
    return { ok: true, actor: { memberId, source: "oauth" } };
  };
}

/** Pull the token out of an `Authorization: Bearer <token>` header, if present. */
function extractBearer(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  const token = match?.[1]?.trim();
  return token && token.length > 0 ? token : undefined;
}

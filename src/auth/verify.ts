import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import type { AuthConfig } from "../config.js";

/**
 * Phase-2 token validation (ADR-0010). We are only a Resource Server: given a
 * Bearer JWT minted by Stytch, verify its signature against Stytch's JWKS and
 * its `iss`/`aud`/`exp`, then surface the email claim. We never issue tokens.
 */

/** Thrown when a token is absent, malformed, or fails verification. */
export class TokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TokenError";
  }
}

export interface TokenClaims {
  email: string;
}

export type TokenVerifier = (token: string) => Promise<TokenClaims>;

/**
 * Build a verifier from a JWKS key resolver. The resolver is injectable so Seam
 * 1 tests supply a local key set (no live IdP); production uses a cached remote
 * JWKS (see {@link makeVerifierFromConfig}). `jwtVerify` enforces the signature
 * and `exp`; `issuer`/`audience` pin `iss`/`aud`.
 */
export function makeTokenVerifier(opts: {
  jwks: JWTVerifyGetKey;
  issuer: string;
  audience: string;
  emailClaim?: string;
}): TokenVerifier {
  const emailClaim = opts.emailClaim ?? "email";
  return async (token) => {
    let payload;
    try {
      ({ payload } = await jwtVerify(token, opts.jwks, {
        issuer: opts.issuer,
        audience: opts.audience,
      }));
    } catch (err) {
      // Surface a short reason for logs, but never the token itself.
      throw new TokenError(err instanceof Error ? err.message : "token verification failed");
    }
    const email = payload[emailClaim];
    if (typeof email !== "string" || email.length === 0) {
      throw new TokenError(`token is missing a string '${emailClaim}' claim`);
    }
    return { email };
  };
}

/**
 * Production verifier: a signature-checking JWKS fetched from Stytch and cached
 * by `jose` (it re-fetches on unknown `kid`, so key rotation is transparent).
 */
export function makeVerifierFromConfig(auth: AuthConfig): TokenVerifier {
  const jwks = createRemoteJWKSet(new URL(auth.jwksUrl));
  return makeTokenVerifier({
    jwks,
    issuer: auth.issuer,
    audience: auth.audience,
    emailClaim: auth.emailClaim,
  });
}

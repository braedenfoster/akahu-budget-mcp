/**
 * RFC 9207 issuer fix-up for the OAuth redirect back to the client.
 *
 * Stytch's metadata advertises `authorization_response_iss_parameter_supported`
 * with an https issuer, but its authorize/submit redirect carries a different,
 * non-URL `iss`. ChatGPT compares the two exactly and rejects the sign-in, so
 * the redirect must carry the advertised issuer.
 */
export function withIssuer(redirectUri: string, issuer: string): string {
  let url: URL;
  try {
    url = new URL(redirectUri);
  } catch {
    return redirectUri;
  }
  url.searchParams.set('iss', issuer);
  return url.toString();
}

/** The issuer the MCP server advertises in its protected-resource metadata. */
export function issuerFromResourceMetadata(metadata: unknown): string | null {
  if (typeof metadata !== 'object' || metadata === null) return null;
  const servers = (metadata as { authorization_servers?: unknown }).authorization_servers;
  if (!Array.isArray(servers)) return null;
  const first: unknown = servers[0];
  return typeof first === 'string' && first.length > 0 ? first : null;
}

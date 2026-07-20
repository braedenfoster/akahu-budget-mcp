# 10 — Phase 2: public exposure via Tailscale Funnel + OAuth

**What to build:** The `/mcp` endpoint is reachable from the public internet so OpenAI's servers can call it, protected by OAuth 2.1 that maps an authenticated email to a Member. This is the fenced-off Phase-2 slice — nothing in V1 depends on it. See ADR-0002.

**Blocked by:** 09.

**Status:** ready-for-agent

- [ ] `/mcp` exposed publicly via Tailscale Funnel (or Cloudflare Tunnel) with a stable HTTPS URL; the tailnet path remains for the Claude Member.
- [ ] OAuth 2.1 (auth-code + PKCE, dynamic client registration) via a managed IdP (Auth0/Stytch/Clerk); the server validates the IdP's token and maps **email → Member**.
- [ ] Auth is enforced on the public path without changing the transport (already Streamable HTTP) or any tool contract.
- [ ] Unauthenticated requests are rejected; an authenticated request is attributed to the correct Member in the audit log.
- [ ] Tests cover token validation and email→Member mapping (mocked IdP); no secrets logged.

# Phase-2 public auth: Stytch as Authorization Server, our server as Resource Server

For the Phase-2 public path (ADR-0002), we expose a **second listener** — the only port `tailscale funnel` points at — and protect it with **OAuth 2.1 where Stytch is the Authorization Server and our MCP server is only a token-validating Resource Server**. The server serves `/.well-known/oauth-protected-resource` (RFC 9728), validates the Bearer JWT against Stytch's JWKS (`iss`/`aud`/`exp`), maps the token's email to a **Member**, and **rejects any email not attached to a Member** (403). The tailnet listener is unchanged and OAuth-free — WireGuard remains its auth (ADR-0002) — and attributes requests to a configured default Member.

This refines ADR-0002's "OAuth 2.1 via a managed IdP (Auth0/Stytch/Clerk)" by pinning the provider and, more importantly, the **integration shape**: we implement no authorization-server endpoints (`/authorize`, `/token`, Dynamic Client Registration) — Stytch owns all of that.

## Considered Options

- **Single always-OAuth listener** — rejected: forces the Claude Member through OAuth over the tailnet too, contradicting ADR-0002 and adding friction to a working Phase-1 path. A single listener that *sniffs* for a Bearer token is worse — "am I on the public path?" becomes a fragile in-app guess instead of a hard network fact. The **two-listener split makes the security boundary network-enforced**: Funnel forwards only to the authenticated port, so the open tailnet port is never publicly routable, even if the auth middleware has a bug.
- **Implement our own Authorization Server** (issue tokens, host DCR) — rejected: substantial security-sensitive surface (token issuance, client registration, key rotation) for a two-person household. Being a Resource Server only is a fraction of the code and lets a managed IdP carry the risk.
- **Auth0 / Clerk / WorkOS instead of Stytch** — Auth0's DCR is gated behind a management-API toggle with a more enterprise-shaped free tier; Clerk's MCP/DCR story is newer and oriented to Clerk-hosted frontends rather than a headless RS-only role; WorkOS is comparable to Stytch but offers no advantage unless already in use. Stytch is purpose-built for MCP auth (open DCR, publishes the well-known metadata MCP clients expect) with the least glue for our shape.

## Consequences

- **DCR is the hard requirement**, not a nicety: ChatGPT's connector registers itself at connect time, so the AS must support Dynamic Client Registration. This is the main filter that drove the provider choice.
- **The email→Member table is the allowlist.** Authenticating with Stytch is necessary but not sufficient; only emails explicitly attached to a Member get in. `members.email` (already nullable in the schema, reserved for this) is populated from config; there is no separate allowlist.
- **Audit attribution requires a schema change.** `audit_log` gains nullable `actor_member_id` (FK → members) and `actor_source` (`tailnet | oauth`); the per-request Member is threaded through `AppContext` into the write wrapper. Nullable keeps existing rows and system writes valid.
- **The tool contract and transport are untouched.** Both listeners mount the same `/mcp` handler and the same MCP server; they differ only in the middleware chain and which actor is injected. Phase-2 is opt-in — with no public port configured, only the tailnet listener binds and V1 deployments are unaffected.
- **Deferred:** rejected-email auditing (unknown emails are refused without a security-log entry); per-request rate limiting on the public path.

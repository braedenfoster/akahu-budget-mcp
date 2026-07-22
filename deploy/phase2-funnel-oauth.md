# Phase 2: public exposure via Tailscale Funnel + OAuth

Phase 2 makes `/mcp` reachable from the public internet so OpenAI's servers can
call it (ADR-0002), guarded by OAuth 2.1 with **Stytch as the Authorization
Server and this app as a token-validating Resource Server** (ADR-0010). It is
**opt-in**: with no `PUBLIC_PORT` set, only the OAuth-free tailnet listener binds
and the Phase-1 (Claude) deployment is unchanged.

## Topology: two listeners, one process

The server binds two HTTP listeners:

| Listener | Port | Auth | Reached by |
|----------|------|------|------------|
| tailnet  | `PORT` (e.g. 3000)        | none — WireGuard is the auth | Claude, via `tailscale serve` / MagicDNS |
| public   | `PUBLIC_PORT` (e.g. 3443) | OAuth 2.1 (Stytch JWT)       | ChatGPT, via `tailscale funnel`          |

Both mount the same `/mcp` handler and the same tools; they differ only in the
middleware chain and which Member each request is attributed to. The security
boundary is **network-enforced**: Funnel forwards only to the public port, so the
open tailnet port is never publicly routable even if the auth middleware has a
bug.

## Tailscale wiring

`serve` keeps the private tailnet path; `funnel` exposes **only the public
port**:

```bash
# Private tailnet path for the Claude Member (unchanged from Phase 1):
tailscale serve --bg --https=443 http://127.0.0.1:3000

# Public HTTPS path for ChatGPT — targets the OAuth-guarded port ONLY:
tailscale funnel --bg --https=8443 http://127.0.0.1:3443
```

`tailscale funnel status` prints the stable public URL
(`https://<host>.<tailnet>.ts.net:8443`). That URL — down to the port — is the
canonical resource identifier; use it for `AUTH_AUDIENCE` / `AUTH_RESOURCE`.

## Stytch setup (Authorization Server)

Stytch owns all authorization-server endpoints — `/authorize`, `/token`, and
**Dynamic Client Registration** (DCR), which ChatGPT's connector needs to
register itself at connect time. This app implements none of them.

1. Create a Stytch project and enable **Connected Apps** with **Dynamic Client
   Registration** turned on.
2. Note the project's **issuer** URL and **JWKS** URL, and the **project id**.
3. Point the resource audience at the public Funnel URL so issued tokens carry
   the right `aud`.

## Server config

Set these in the Pi's `.env` (see `.env.example`) alongside the Phase-1 vars:

```bash
PUBLIC_PORT=3443                                   # enables the public listener
STYTCH_PROJECT_ID=project-live-...                 # required
AUTH_ISSUER=https://<slug>.stytch.com/oauth        # required — token `iss`
AUTH_AUDIENCE=https://<host>.<tailnet>.ts.net:8443 # required — token `aud` + resource id
# Optional (sensible defaults derived from the above):
# AUTH_RESOURCE=https://<host>.<tailnet>.ts.net:8443   # defaults to AUTH_AUDIENCE
# STYTCH_JWKS_URL=https://<slug>.stytch.com/oauth/.well-known/jwks.json
# AUTH_EMAIL_CLAIM=email                               # claim carrying the email

# The email → Member allowlist. A valid token whose email maps to no Member is
# rejected (403); this table IS the allowlist.
AUTH_MEMBER_EMAILS=Braeden:braeden@example.com,Partner:partner@example.com

# Which Member the OAuth-free tailnet path is attributed to (default: first seeded).
TAILNET_DEFAULT_MEMBER=Braeden
```

**Fail-fast:** if `PUBLIC_PORT` is set but any of `STYTCH_PROJECT_ID` /
`AUTH_ISSUER` / `AUTH_AUDIENCE` is missing, the server exits at startup rather
than serve an unprotected public port. No token or secret is ever logged.

## How a request is authorized

1. The public listener serves `GET /.well-known/oauth-protected-resource`
   (RFC 9728), naming this resource and the Stytch Authorization Server, so an
   MCP client discovers where to get a token.
2. Each `POST /mcp` must carry `Authorization: Bearer <jwt>`. The middleware
   validates the JWT against Stytch's JWKS (cached), checking `iss` / `aud` /
   `exp`, and reads the email claim.
3. A missing or invalid token ⇒ **401** with
   `WWW-Authenticate: Bearer resource_metadata="<metadata URL>"`.
4. A valid token whose email maps to no Member ⇒ **403**.
5. On success the request is attributed to the resolved Member and every write
   records `actor_member_id` + `actor_source='oauth'` in `audit_log`.

## Verifying

```bash
# Metadata is public (no token):
curl https://<host>.<tailnet>.ts.net:8443/.well-known/oauth-protected-resource

# No token ⇒ 401 + WWW-Authenticate challenge:
curl -i -X POST https://<host>.<tailnet>.ts.net:8443/mcp

# Health is unauthenticated on both listeners:
curl https://<host>.<tailnet>.ts.net:8443/healthz
```

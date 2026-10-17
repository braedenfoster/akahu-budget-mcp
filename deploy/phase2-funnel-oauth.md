# Phase 2: public exposure via Tailscale Funnel + Stytch OAuth

Phase 2 makes `/mcp` reachable from the public internet so ChatGPT (and remote
Claude) can call it (ADR-0002), guarded by OAuth 2.1 with **Stytch as the
Authorization Server and this app as a token-validating Resource Server**
(ADR-0010). It is **opt-in**: with no `PUBLIC_PORT` set, only the OAuth-free
tailnet listener binds and the Phase-1 (Claude Desktop) path is unchanged.

Substitute your own values for the placeholders:

| Placeholder | Meaning |
|---|---|
| `<your-host>.<your-tailnet>.ts.net` | your Tailscale node's MagicDNS name (`tailscale status`) |
| `<slug>.customers.stytch.dev` | your Stytch project domain |
| `<your-project-id>` | your Stytch project id (`project-test-…` / `project-live-…`) |
| `<user>@<host>` | ssh target for your deploy host |

Grounded in the cited research: `docs/research/stytch-connected-apps-mcp.md`.
Two facts from that research shape this doc and differ from the naive setup:

1. **Stytch does not host the OAuth consent page.** You must host a page that
   mounts Stytch's `<B2BIdentityProvider>` and register its URL as the Stytch
   "Authorization URL". That page is the `auth-page/` package in this repo. Until
   the Authorization URL is set, Stytch's `/.well-known/oauth-authorization-server`
   returns HTTP 400 and no client can complete the flow.
2. **The access-token `aud` is the Stytch `project_id`**, not the MCP URL. So
   `AUTH_AUDIENCE=<your-project-id>`, while `AUTH_RESOURCE` (the RFC 9728 resource
   id) is the public host origin.

## Topology: two app listeners + one static page, path-routed on 443

The MCP server binds two HTTP listeners; the auth page is a separate static
server. Funnel on **443** path-routes between them:

```
https://<your-host>.<your-tailnet>.ts.net
   ├─ /mcp  + /.well-known/oauth-protected-resource + /healthz  → MCP public listener 127.0.0.1:3443 (OAuth)
   └─ /oauth/authorize (+ SPA assets)                            → static Stytch auth page 127.0.0.1:8088
```

| Component        | Port (localhost) | Auth                         | Reached by |
|------------------|------------------|------------------------------|------------|
| MCP tailnet      | `PORT` (3000)    | none — WireGuard is the auth | Claude Desktop, via `tailscale serve` / MagicDNS |
| Widget (tailnet) | `PORT` (3000), `/widget` only | none — WireGuard is the auth | Phone widget, via `tailscale serve` HTTPS `:8443` |
| MCP public       | `PUBLIC_PORT` (3443) | OAuth 2.1 (Stytch JWT)   | ChatGPT / remote Claude, via Funnel `/mcp` |
| Auth page        | 8088             | Stytch B2B login (Email OTP) | The OAuth consent step, via Funnel `/oauth` |

The security boundary is **network-enforced**: Funnel forwards only to these
localhost ports; the tailnet MCP port is never publicly routable even if the auth
middleware has a bug.

## Prerequisites (one-time)

- Tailnet HTTPS certs **enabled** in the Tailscale admin console (DNS page).
  Funnel on 443 needs a cert.
- **Funnel enabled** for your tailnet (the first `tailscale funnel` command prints
  an admin-console URL to enable it if not).
- A deploy host reachable at `<user>@<host>` with the repo checked out, Node 22 +
  pnpm installed, and a `.env` alongside it.

## Stytch dashboard setup (Authorization Server)

Project type: **B2B**. Create a Connected App (first-party public) with DCR
**enabled**.

1. **API Keys** → copy the **public token** (publishable) for the auth page build.
2. Create an **Organization** and add each household member as a **Member**, using
   the exact email each will sign in with. These emails must match
   `AUTH_MEMBER_EMAILS` (below), case-insensitive. (Discovery login *requires* the
   sign-in email to already be a Member — there is no self-signup.)
3. **Frontend SDK → Configuration:** enable the SDK and add the auth-page origin
   `https://<your-host>.<your-tailnet>.ts.net` to **Authorized domains**. Without
   this the login form errors with "website has not been registered as an allowed
   domain". Confirm **Email OTP** is an enabled SDK auth method.
4. **Connected Apps → Settings → access-token template** (`{}` field): set to
   ```
   { "email": {{ member.email_address }} }
   ```
   ⚠️ The variable is **UNQUOTED** — Stytch auto-quotes the substituted value, and
   the dashboard rejects `"{{ … }}"` with "Variables cannot be inside quotes". This
   puts a top-level `email` claim in the access token, which the RS keys off.
   ⚠️⚠️ **This template is snapshotted onto each DCR client AT CREATION TIME.** If a
   client (ChatGPT/Claude connector) registered *before* the template was saved,
   its tokens will never carry `email` no matter how often you reconnect — you must
   **delete the connector and re-add it** so a fresh DCR client inherits the
   template. Set/verify this template BEFORE first connecting a client.
5. **Login method:** Email OTP (the `auth-page` is built for this — no redirect
   URL to register).
6. **Authorization URL** (set only AFTER the auth page is deployed and reachable):
   `https://<your-host>.<your-tailnet>.ts.net/oauth/authorize`.
   Until this is set, `/.well-known/oauth-authorization-server` returns 400 —
   expected.

## Build & deploy the auth page

Build on a machine with more RAM than a small host (a 1 GB Pi struggles) — **build
locally, ship the static `dist/`.**

```bash
# On your build machine, in the repo:
cp auth-page/.env.example auth-page/.env
# edit auth-page/.env → VITE_STYTCH_PUBLIC_TOKEN=<public token from step 1>
pnpm --filter auth-page build          # → auth-page/dist/

# Ship dist/ + the static server to the host (dist/ is gitignored, so rsync it):
rsync -av auth-page/dist/    <user>@<host>:~/akahu-budget-mcp/auth-page/dist/
rsync -av auth-page/serve.mjs <user>@<host>:~/akahu-budget-mcp/auth-page/serve.mjs
```

The app is built with Vite `base: '/oauth/'`, so `index.html` references its
assets under `/oauth/assets/...` — required because Funnel routes only `/oauth`
here; with `base: '/'` the browser would request `/assets/...`, which routes to
the MCP listener and the page would never load. `serve.mjs` strips the `/oauth`
prefix back off (env `BASE_PATH`, default `/oauth`) so it still finds the files
in `dist/` — and it works whether or not Funnel itself strips the prefix.

`serve.mjs` is a dependency-free `node:http` static server: it serves `dist/`,
falls back to `index.html` for client-side routes (so `/oauth/authorize`
resolves), and refuses path traversal. Run it under systemd:

```bash
# On the host (edit User= and paths in the unit to match your deploy user first):
sudo cp ~/akahu-budget-mcp/deploy/auth-page.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now auth-page
curl -sI http://127.0.0.1:8088/oauth/authorize   # → 200, text/html
```

## MCP server config

Set these in the host's `.env` (see `.env.example`) alongside the Phase-1 vars,
then rebuild + restart the MCP server:

```bash
PUBLIC_PORT=3443
STYTCH_PROJECT_ID=<your-project-id>
AUTH_ISSUER=https://<slug>.customers.stytch.dev
STYTCH_JWKS_URL=https://<slug>.customers.stytch.dev/.well-known/jwks.json
AUTH_AUDIENCE=<your-project-id>                       # = project_id, NOT the MCP URL
AUTH_RESOURCE=https://<your-host>.<your-tailnet>.ts.net   # RFC 9728 resource id — BARE ORIGIN (server appends /.well-known/...)
AUTH_EMAIL_CLAIM=email
# Names MUST match an existing seeded Member exactly (= AKAHU_MEMBER_NAME_*),
# else a new empty Member is created and the OAuth user won't see the data.
AUTH_MEMBER_EMAILS=Alex:alex@example.com             # add ",Sam:sam@example.com" as needed
TAILNET_DEFAULT_MEMBER=Alex
```

```bash
# On the host:
git pull && pnpm install && pnpm build
sudo systemctl restart akahu-budget-mcp
```

**Fail-fast:** if `PUBLIC_PORT` is set but any of `STYTCH_PROJECT_ID` /
`AUTH_ISSUER` / `AUTH_AUDIENCE` is missing, the server exits at startup rather
than serve an unprotected public port. No token or secret is ever logged.

## Tailscale wiring

`serve` keeps the private tailnet path (unchanged from Phase 1). `funnel`
path-routes 443 between the auth page and the MCP public port. Verify the exact
`--set-path` syntax at run time (`tailscale funnel --help`):

```bash
# Private tailnet path for the Claude Desktop Member (unchanged):
sudo tailscale serve --bg --http=80 http://127.0.0.1:3000

# Private tailnet HTTPS for the phone widget only (443 belongs to Funnel, and
# browsers upgrade the HTTP URL to 443). Never Funnel this port: the route has no auth.
sudo tailscale serve --bg --https=8443 --set-path=/widget http://127.0.0.1:3000/widget

# Public HTTPS on 443, path-routed:
sudo tailscale funnel --bg --https=443 --set-path=/oauth http://127.0.0.1:8088
sudo tailscale funnel --bg --https=443 http://127.0.0.1:3443
sudo tailscale funnel status
```

## Verifying

```bash
# Metadata is public (no token) → PRM JSON pointing at Stytch:
curl https://<your-host>.<your-tailnet>.ts.net/.well-known/oauth-protected-resource

# No token ⇒ 401 + WWW-Authenticate challenge:
curl -i -X POST https://<your-host>.<your-tailnet>.ts.net/mcp

# The consent page loads:
curl -sI https://<your-host>.<your-tailnet>.ts.net/oauth/authorize   # → 200 text/html

# Once the Stytch Authorization URL is set, the AS metadata clears the 400:
curl https://<slug>.customers.stytch.dev/.well-known/oauth-authorization-server
```

Then the real end-to-end check: add the server as a custom connector
(`https://<your-host>.<your-tailnet>.ts.net/mcp`), sign in with Email OTP, and
confirm a tool call succeeds and is attributed to your Member.

## How a request is authorized

1. The MCP public listener serves `GET /.well-known/oauth-protected-resource`
   (RFC 9728), naming this resource and the Stytch AS.
2. A missing/invalid token ⇒ **401** with
   `WWW-Authenticate: Bearer resource_metadata="<metadata URL>"`.
3. The client discovers Stytch, (DCR-)registers, runs PKCE authorize — Stytch
   redirects the user to the `/oauth/authorize` page, they log in (Email OTP) and
   consent, and Stytch returns an auth code → access token (JWT).
4. Each `POST /mcp` carries `Authorization: Bearer <jwt>`. The middleware
   validates it against Stytch's JWKS (cached), checking `iss` / `aud` / `exp`,
   and reads the `email` claim.
5. A valid token whose email maps to no Member ⇒ **403**. On success the request
   is attributed to the resolved Member (`actor_source='oauth'` in `audit_log`).

## Verified findings (from a live token)

Confirmed against a real ChatGPT dev-mode connector token:

- **`aud` = `["<your-project-id>"]`** (NOT the client_id). The static
  `AUTH_AUDIENCE=<your-project-id>` check is correct — no RS change needed. Shape of
  a verified token:
  ```json
  {
    "aud": ["<your-project-id>"],
    "email": "alex@example.com",
    "iss": "https://<slug>.customers.stytch.dev",
    "client_id": "connected-app-…",
    "sub": "member-…",
    "scope": "profile phone openid email offline_access",
    "https://stytch.com/organization": { "organization_id": "organization-…", "slug": "…" }
  }
  ```
- **`{{ member.email_address }}` resolves** and lands as a top-level `email` claim —
  but ONLY once the template is saved (unquoted) AND the client is (re-)registered
  after saving it (see dashboard step 4). A missing `email` claim → RS 401 →
  ChatGPT shows "Authentication succeeded, action discovery failed".
- Stytch **accepts-and-ignores** the client's `resource` param (aud stays project_id).

## Client notes

- **ChatGPT** (Plus/Pro **personal** account): Settings → Apps & Connectors →
  Developer mode → new connector, Server URL `…/mcp`, Auth = OAuth (endpoints
  auto-discovered). Tool-calling is currently **web-only** — mobile shows the tools
  but can't invoke them.
- **Org-managed Claude/ChatGPT plans usually block custom connectors** via admin
  policy — use a personal account.

## Debugging

The RS logs no per-request lines. To inspect a live token's claims, temporarily add
`decodeJwt(token)` logging in `src/auth/verify.ts`, `pnpm build`, restart, reproduce,
then `git checkout src/auth/verify.ts` to revert. A missing `email` claim (401) vs an
unknown email (403) vs an `aud`/`iss` mismatch (401) each point at a different fix.

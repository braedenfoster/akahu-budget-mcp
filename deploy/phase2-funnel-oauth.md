# Phase 2: public exposure via Tailscale Funnel + Stytch OAuth

Phase 2 makes `/mcp` reachable from the public internet so the Claude mobile/web
app (and later ChatGPT) can call it (ADR-0002), guarded by OAuth 2.1 with
**Stytch as the Authorization Server and this app as a token-validating Resource
Server** (ADR-0010). It is **opt-in**: with no `PUBLIC_PORT` set, only the
OAuth-free tailnet listener binds and the Phase-1 (Claude Desktop) path is
unchanged.

Grounded in the cited research: `docs/research/stytch-connected-apps-mcp.md`.
Two facts from that research shape this doc and differ from the naive setup:

1. **Stytch does not host the OAuth consent page.** We must host a page that
   mounts Stytch's `<B2BIdentityProvider>` and register its URL as the Stytch
   "Authorization URL". That page is the `auth-page/` package in this repo. Until
   the Authorization URL is set, Stytch's `/.well-known/oauth-authorization-server`
   returns HTTP 400 and no client can complete the flow.
2. **The access-token `aud` is the Stytch `project_id`**, not the MCP URL. So
   `AUTH_AUDIENCE=<project_id>`, while `AUTH_RESOURCE` (the RFC 9728 resource id)
   is the public tailnet URL. (See the OPEN RISK at the bottom — confirm with the
   first real token.)

## Topology: two app listeners + one static page, path-routed on 443

The MCP server binds two HTTP listeners; the auth page is a separate static
server. Funnel on **443** path-routes between them:

```
https://pixelsprout-1.tail8d66c9.ts.net
   ├─ /mcp  + /.well-known/oauth-protected-resource + /healthz  → MCP public listener 127.0.0.1:3443 (OAuth)
   └─ /oauth/authorize (+ SPA assets)                            → static Stytch auth page 127.0.0.1:8088
```

| Component        | Port (localhost) | Auth                         | Reached by |
|------------------|------------------|------------------------------|------------|
| MCP tailnet      | `PORT` (3000)    | none — WireGuard is the auth | Claude Desktop, via `tailscale serve` / MagicDNS |
| MCP public       | `PUBLIC_PORT` (3443) | OAuth 2.1 (Stytch JWT)   | Claude mobile/web, ChatGPT, via Funnel `/mcp` |
| Auth page        | 8088             | Stytch B2B login (Email OTP) | The OAuth consent step, via Funnel `/oauth` |

The security boundary is **network-enforced**: Funnel forwards only to these
localhost ports; the tailnet MCP port is never publicly routable even if the auth
middleware has a bug.

## Prerequisites (one-time)

- Tailnet HTTPS certs **enabled** in the Tailscale admin console (DNS page).
  Funnel on 443 needs a cert. (This was the Phase-1 blocker; now enabled.)
- Pi facts: `ssh pixelsprout@192.168.68.115`, repo at
  `/home/pixelsprout/akahu-budget-mcp`, Node 22 + pnpm 11. See memory
  `pi-deployment`.

## Stytch dashboard setup (Authorization Server) — user steps

Project: **B2B**, domain `https://fearless-utensil-8259.customers.stytch.dev`,
Connected App `Budget-pi` (first_party_public), DCR **enabled**.

1. **API Keys** → copy the **public token** (publishable) for the auth page build.
2. Create an **Organization** and add each household member as a **Member**, using
   the exact email each will sign in with. These emails must match
   `AUTH_MEMBER_EMAILS` (below), case-insensitive.
3. **Connected Apps → Settings → access-token template** (`{}` field): set to
   ```json
   { "email": "{{ member.email_address }}" }
   ```
   so the access token carries a top-level `email` claim the RS keys off.
4. **Login method:** Email OTP (the `auth-page` is built for this — no redirect
   URL to register).
5. **Authorization URL** (set only AFTER the auth page is deployed and reachable):
   `https://pixelsprout-1.tail8d66c9.ts.net/oauth/authorize`.
   Until this is set, `/.well-known/oauth-authorization-server` returns 400 —
   expected.

## Build & deploy the auth page

The Pi has 1 GB RAM — **build on the Mac**, ship the static `dist/`.

```bash
# On the Mac, in the repo:
cp auth-page/.env.example auth-page/.env
# edit auth-page/.env → VITE_STYTCH_PUBLIC_TOKEN=<public token from step 1>
pnpm --filter auth-page build          # → auth-page/dist/

# Ship dist/ + the static server to the Pi (dist/ is gitignored, so rsync it):
rsync -av auth-page/dist/ pixelsprout@192.168.68.115:/home/pixelsprout/akahu-budget-mcp/auth-page/dist/
rsync -av auth-page/serve.mjs pixelsprout@192.168.68.115:/home/pixelsprout/akahu-budget-mcp/auth-page/serve.mjs
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
# On the Pi (edit User/paths in the unit to pixelsprout first):
sudo cp /home/pixelsprout/akahu-budget-mcp/deploy/auth-page.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now auth-page
curl -sI http://127.0.0.1:8088/oauth/authorize   # → 200, text/html
```

## MCP server config

Set these in the Pi's `.env` (see `.env.example`) alongside the Phase-1 vars,
then rebuild + restart the MCP server:

```bash
PUBLIC_PORT=3443
STYTCH_PROJECT_ID=project-test-3ccd69c4-a4f2-4f78-9a32-a45a91b4e3bf
AUTH_ISSUER=https://fearless-utensil-8259.customers.stytch.dev
STYTCH_JWKS_URL=https://fearless-utensil-8259.customers.stytch.dev/.well-known/jwks.json
AUTH_AUDIENCE=project-test-3ccd69c4-a4f2-4f78-9a32-a45a91b4e3bf   # = project_id, NOT the MCP URL
AUTH_RESOURCE=https://pixelsprout-1.tail8d66c9.ts.net/mcp        # RFC 9728 resource id = canonical MCP URL
AUTH_EMAIL_CLAIM=email
AUTH_MEMBER_EMAILS=Braeden:braedenleefoster@gmail.com            # add ",Partner:her@email" as needed
TAILNET_DEFAULT_MEMBER=Braeden
```

```bash
# On the Pi:
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

# Public HTTPS on 443, path-routed:
sudo tailscale funnel --bg --https=443 --set-path=/oauth http://127.0.0.1:8088
sudo tailscale funnel --bg --https=443 http://127.0.0.1:3443
sudo tailscale funnel status
```

## Verifying

```bash
# Metadata is public (no token) → PRM JSON pointing at Stytch:
curl https://pixelsprout-1.tail8d66c9.ts.net/.well-known/oauth-protected-resource

# No token ⇒ 401 + WWW-Authenticate challenge:
curl -i -X POST https://pixelsprout-1.tail8d66c9.ts.net/mcp

# The consent page loads:
curl -sI https://pixelsprout-1.tail8d66c9.ts.net/oauth/authorize   # → 200 text/html

# Once the Stytch Authorization URL is set, the AS metadata clears the 400:
curl https://fearless-utensil-8259.customers.stytch.dev/.well-known/oauth-authorization-server
```

Then the real end-to-end check: add the server in the Claude mobile app as a
custom connector (`https://pixelsprout-1.tail8d66c9.ts.net/mcp`), sign in with
Email OTP, and confirm a tool call succeeds and is attributed to your Member.

## How a request is authorized

1. The MCP public listener serves `GET /.well-known/oauth-protected-resource`
   (RFC 9728), naming this resource and the Stytch AS.
2. A missing/invalid token ⇒ **401** with
   `WWW-Authenticate: Bearer resource_metadata="<metadata URL>"`.
3. The client discovers Stytch, (DCR-)registers, runs PKCE authorize — Stytch
   redirects the user to our `/oauth/authorize` page, they log in (Email OTP) and
   consent, and Stytch returns an auth code → access token (JWT).
4. Each `POST /mcp` carries `Authorization: Bearer <jwt>`. The middleware
   validates it against Stytch's JWKS (cached), checking `iss` / `aud` / `exp`,
   and reads the `email` claim.
5. A valid token whose email maps to no Member ⇒ **403**. On success the request
   is attributed to the resolved Member (`actor_source='oauth'` in `audit_log`).

## OPEN RISK — resolve with the first real token

Stytch's docs contradict themselves on the access-token `aud`: prose says
**client_id**, the example shows **`["PROJECT_ID"]`**. Our RS does a static `aud`
check against `AUTH_AUDIENCE`.

- If `aud = project_id` → `AUTH_AUDIENCE=<project_id>` (as above), done.
- If `aud = client_id` → DCR client IDs are dynamic, so a static check can't work
  → small RS tweak needed (relax/adjust the `aud` check; `iss` + signature +
  email allowlist still protect). Diagnose once a real token exists.

Also confirm with the first token: `{{ member.email_address }}` actually resolves
in the *access-token* template, and Stytch accepts-and-ignores the client's
`resource` param.

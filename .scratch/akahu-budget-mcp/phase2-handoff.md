# Phase 2 enablement — session handoff

**Goal of the next session:** finish enabling Phase 2 (public OAuth access so the Claude mobile/web app — and later ChatGPT — can reach the budget MCP server). The server code is already shipped (ticket 10); what remains is a **build + deploy of a Stytch authorization page** plus Pi config + verification.

Pick up at: **"build the Stytch B2B auth page."**

## Durable context to read first
- `docs/research/stytch-connected-apps-mcp.md` — full cited research on Stytch Connected Apps for MCP. **Read this first.**
- `docs/adr/0010-phase2-oauth-resource-server-stytch.md` — the design (server is a token-validating Resource Server; Stytch is the AS).
- `.scratch/akahu-budget-mcp/issues/10-phase2-funnel-oauth.md` — ticket (shipped).
- `deploy/phase2-funnel-oauth.md` — deploy doc (⚠️ predates the research; needs updating for the self-hosted auth page + `aud=project_id` findings).
- Memory `pi-deployment.md` — Pi access, systemd service, DNS/SSH gotchas.

## Phase 1 status (done, do not redo)
Server runs on the Pi as systemd `akahu-budget-mcp`, synced with Akahu (3 accounts, 2715 txns), reachable from Claude **Desktop** over the tailnet (HTTP-over-tailnet via `tailscale serve --http=80` → 127.0.0.1:3000, `mcp-remote --allow-http`). That path is untouched by Phase 2 — do not disturb it.

## Pi / tailnet facts
- SSH: `ssh pixelsprout@192.168.68.115` (Mac's `~/.ssh/id_ed25519`, comment `pi-budget`, authorized; passwordless sudo).
- Tailnet node: `pixelsprout-1.tail8d66c9.ts.net`. HTTPS certs now ENABLED (cert issuance verified working).
- Repo on Pi: `/home/pixelsprout/akahu-budget-mcp`, `.env` alongside. Node 22 + pnpm 11.1.0.
- Update flow: `git pull` → `pnpm install && pnpm build` → `sudo systemctl restart akahu-budget-mcp`.

## Decision: host the auth page ON THE PI (user chose this over Vercel)

### Topology — Funnel on 443, path-routed
```
https://pixelsprout-1.tail8d66c9.ts.net
   ├─ /mcp  + /.well-known/oauth-protected-resource + /healthz  → MCP public listener 127.0.0.1:3443 (OAuth)
   └─ /oauth/authorize (+ SPA assets)                            → static Stytch auth page 127.0.0.1:8088
```
Funnel commands (verify exact `--set-path` syntax at run time):
```
sudo tailscale funnel --bg --https=443 --set-path=/oauth http://127.0.0.1:8088
sudo tailscale funnel --bg --https=443 http://127.0.0.1:3443
```

## Config mapping (from the research — server code already supports this, NO code change expected)
Add to the Pi's `.env`:
```
PUBLIC_PORT=3443
STYTCH_PROJECT_ID=<project id — get from Stytch dashboard>
AUTH_ISSUER=https://fearless-utensil-8259.customers.stytch.dev
STYTCH_JWKS_URL=https://fearless-utensil-8259.customers.stytch.dev/.well-known/jwks.json
AUTH_AUDIENCE=<STYTCH_PROJECT_ID>        # aud is the project_id, NOT the MCP URL, NOT client_id
AUTH_RESOURCE=https://pixelsprout-1.tail8d66c9.ts.net   # RFC 9728 resource id (separate from aud — our config allows this)
AUTH_EMAIL_CLAIM=email
AUTH_MEMBER_EMAILS=<Name:email pairs — must match the Stytch Org members / allowlist>
TAILNET_DEFAULT_MEMBER=<member name, e.g. Braeden>
```
Server behavior recap: missing/invalid token → 401 + `WWW-Authenticate: Bearer resource_metadata="…"`; valid token whose email isn't a Member → 403; fail-fast at startup if `PUBLIC_PORT` set but Stytch trio missing.

## Pending Stytch dashboard steps (user)
Project: **B2B**, domain `https://fearless-utensil-8259.customers.stytch.dev`, Connected App `Budget-pi` (first_party_public), DCR **enabled**.
1. Grab the **public token** (API Keys) → needed by the auth page frontend.
2. Create an **Organization**, add the 2 users as **Members** with their emails.
3. Set **access-token template** (Connected Apps → Settings, the `{}` field) to: `{ "email": "{{ member.email_address }}" }`.
4. Choose **login method** for the auth page (Email OTP = least config; Magic Link = needs redirect URL).
5. Set **Authorization URL** = `https://pixelsprout-1.tail8d66c9.ts.net/oauth/authorize` — ONLY after the page is deployed. (While blank, `/.well-known/oauth-authorization-server` returns 400 — expected.)

## The build (next session's main work)
Minimal **Vite + Stytch B2B React** app: a login-gated page at `/oauth/authorize` that renders `<IdentityProvider>` (from `@stytch/react/b2b`) after a B2B login. **Build on the Mac** (not the 1 GB Pi), ship the static `dist/` to the Pi, serve on 127.0.0.1:8088 (tiny static server), then Funnel `/oauth` → it. Uses the Stytch public token.

## Verification plan
- `curl https://pixelsprout-1.tail8d66c9.ts.net/.well-known/oauth-protected-resource` → PRM JSON pointing at Stytch.
- `curl -i -X POST https://pixelsprout-1.tail8d66c9.ts.net/mcp` (no token) → 401 + `WWW-Authenticate`.
- Real sign-in from the Claude mobile app as a custom connector (`https://pixelsprout-1.tail8d66c9.ts.net/mcp`).

## OPEN RISK — resolve with the first real token
Stytch's docs contradict themselves on the access-token `aud`: prose says **client_id**, example shows **`["PROJECT_ID"]`**. Our RS does a static `aud` check (`AUTH_AUDIENCE`).
- If `aud = project_id` → set `AUTH_AUDIENCE=<project_id>`, done.
- If `aud = client_id` → DCR client IDs are dynamic/unknown ahead of time, so a static check can't work → small RS tweak needed (relax/adjust the `aud` check; `iss` + signature + email-allowlist still protect). This is `/diagnosing-bugs` territory once a token exists.
Also confirm: `member.email_address` actually resolves in the *access-token* template (docs enumerate it for session templates); Stytch accepts-and-ignores the `resource` param.

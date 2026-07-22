# Stytch B2B auth page — Phase 2 enablement design

**Date:** 2026-07-23
**Status:** approved (brainstorming)
**Context:** `.scratch/akahu-budget-mcp/phase2-handoff.md`, `docs/adr/0010-phase2-oauth-resource-server-stytch.md`, `docs/research/stytch-connected-apps-mcp.md`

## Problem

The Phase-2 OAuth Resource Server is shipped (ticket 10): the MCP server validates
Stytch-issued JWTs and serves RFC 9728 metadata. But Stytch does **not** host the
OAuth authorization/consent page for Connected Apps — the app must host a page that
mounts Stytch's `<B2BIdentityProvider />` and register its URL as the Stytch
"Authorization URL". Until that URL is set, Stytch's
`/.well-known/oauth-authorization-server` returns HTTP 400 and no MCP client can
complete the flow. This design builds that page.

## Decisions

- **Login method: Email OTP** (least config — no redirect URL to register).
- **Location: `auth-page/` pnpm workspace package** (isolates React/Vite/Stytch deps
  from the server package).
- **Hosting: on the Pi.** Built on the Mac (`dist/`), shipped to the Pi, served by a
  tiny static server on `127.0.0.1:8088`; Funnel path-routes `/oauth` → it.
- **Stytch project: B2B** (existing), project `project-test-3ccd69c4-...`,
  domain `https://fearless-utensil-8259.customers.stytch.dev`.

## Architecture

### `auth-page/` — Vite + React + TypeScript SPA

- `package.json` — deps `@stytch/react`, `@stytch/vanilla-js`, `react`, `react-dom`;
  dev `vite`, `@vitejs/plugin-react`, `typescript`, `@types/react`, `@types/react-dom`.
  Scripts: `dev`, `build` (`tsc && vite build`), `preview`, `serve` (static server).
- `vite.config.ts` — React plugin; `base: '/'`.
- `.env.example` — documents `VITE_STYTCH_PUBLIC_TOKEN`. Real value in gitignored
  `.env` at build time. (`.env`, `.env.*`, and `dist/` already gitignored at repo root.)
- `index.html` → `src/main.tsx`:
  - Build a Stytch B2B UI client from `import.meta.env.VITE_STYTCH_PUBLIC_TOKEN`
    (fail loudly with a visible message if unset).
  - Wrap the app in `<StytchB2BProvider>`.
- `src/App.tsx` — single meaningful route `/oauth/authorize`:
  - Read the B2B member session via `useStytchMemberSession()`.
  - **No session** → render the Stytch B2B login UI configured for **Email OTP**,
    `authFlowType: "Discovery"` (org-less discovery login so any Org member can
    authenticate). On success the member has a session.
  - **Active session** → render `<IdentityProvider />` (B2B) which parses
    `client_id` / `redirect_uri` / `scope` / `state` / `code_challenge` / `resource`
    from the query string and shows the consent screen, then redirects back to the
    MCP client with the auth code.
  - Any other path → minimal "Not found" so the SPA never white-screens.

### `auth-page/serve.mjs` — static server (Pi, `127.0.0.1:8088`)

- Dependency-free `node:http` static file server over `dist/`.
- SPA fallback: unknown non-asset paths return `index.html` (so `/oauth/authorize`
  resolves on a hard load / Funnel forward).
- Correct `Content-Type` for `.html/.js/.css/.svg/.json`; no directory traversal
  (resolve + prefix-check against `dist/`).
- Binds `127.0.0.1:8088` (configurable via `PORT`/`HOST` env, defaulting to those).

### Deploy artifacts

- `deploy/auth-page.service` — systemd unit mirroring the `akahu-budget-mcp` pattern
  (runs `node serve.mjs` from the repo's `auth-page/` on the Pi).
- Rewrite `deploy/phase2-funnel-oauth.md`: self-hosted auth page, path-routed Funnel
  on **443** (`/oauth` → :8088, everything else → the MCP public port), and the
  research-correct config (`aud = project_id`, `AUTH_RESOURCE = tailnet URL`).
- Update root `.env.example` Phase-2 block to match (`AUTH_AUDIENCE=<project_id>`,
  `AUTH_RESOURCE=https://pixelsprout-1...ts.net`, `AUTH_EMAIL_CLAIM=email`,
  `STYTCH_JWKS_URL`, `AUTH_ISSUER` = project domain).

## Testing

The SPA is thin glue over Stytch's own React components — a real mobile sign-in is
the only meaningful end-to-end check (deferred; needs the dashboard configured).
Automated gates this session:

- **Build/typecheck gate:** `pnpm --filter auth-page build` must pass.
- **Static-server smoke test** (`auth-page/serve.test.mjs`, run via `node --test`):
  serves `index.html` at `/`, applies SPA fallback for `/oauth/authorize`, serves a
  real asset with the right content-type, and rejects path traversal.

No mocking of Stytch's React components (no value — it would test the mock).

## Out of scope this session (needs user / live token)

- Stytch dashboard: Org + Members, access-token template
  `{ "email": "{{ member.email_address }}" }`, Authorization URL
  `https://pixelsprout-1.tail8d66c9.ts.net/oauth/authorize`.
- Actual Pi deploy, Funnel commands, real mobile sign-in.
- **Open risk:** `aud = project_id` vs `client_id` — resolves only with a real token
  (see handoff). RS currently does a static `aud == project_id` check.

## Success criteria

1. `pnpm --filter auth-page build` produces a static `dist/`.
2. Static-server smoke tests pass.
3. Deploy doc + `.env.example` reflect the research (no stale `:8443` / `aud=<MCP URL>`).
4. A follow-up session can deploy `dist/` to the Pi and complete a real sign-in with
   no code changes — only dashboard config + Funnel commands.

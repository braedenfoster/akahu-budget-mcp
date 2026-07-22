# auth-page

The Stytch B2B **OAuth consent page** for the akahu-budget-mcp Phase-2 public
path (ADR-0010). Stytch does not host the consent page for Connected Apps, so we
host this one: a login-gated SPA that mounts `<B2BIdentityProvider>` at
`/oauth/authorize`. Its URL is registered as the Stytch "Authorization URL".

- **Login:** Email OTP, discovery flow (any Stytch Org member).
- **Config:** `VITE_STYTCH_PUBLIC_TOKEN` (publishable) — copy `.env.example` to
  `.env` and fill it in before building.
- **Build on the Mac** (the Pi has 1 GB RAM), ship `dist/` + `serve.mjs` to the Pi.

```bash
pnpm --filter auth-page build      # → dist/
pnpm --filter auth-page test       # static-server smoke tests (node --test)
node serve.mjs                     # serve dist/ on 127.0.0.1:8088 (HOST/PORT override)
```

Full deploy + Stytch dashboard + Funnel wiring: `deploy/phase2-funnel-oauth.md`.

# Native Android app reads bank figures over the public OAuth listener

The Members' phones get a **native Android app** (Kotlin, Jetpack Glance widget, AppAuth) that reads Household figures from **REST routes on the public OAuth listener** (`GET /api/spending-allowance`, later `GET /api/budget`), behind the same Stytch Bearer and email→Member middleware as `/mcp`. The app is a **pre-registered first-party public Connected App** (fixed `client_id`, PKCE, custom-scheme callback reached through an HTTPS relay page; see Amendment) that signs in once and keeps a Keystore-encrypted refresh token (`offline_access`). The tailnet `/widget/summary` route, its `:8443` `tailscale serve`, the `*_display` strings, and the KWGT widget are retired.

This reverses the Spending allowance spec's rule that the widget route is unavailable on the public listener, and refines ADR-0010: the public listener now serves bank figures to a client other than an AI connector. The tailnet listener stays OAuth-free and keeps Claude Desktop's `/mcp`.

## Considered Options

- **Keep the tailnet JSON route + KWGT** — rejected: every phone needs Tailscale running, browsers upgrade the URL to the Funnel's 443 (hence the `:8443` workaround), KWGT setup is not something both Members will maintain, and it cannot grow into read-only Budget screens or later writes.
- **Native app over the tailnet** — rejected: keeps the Tailscale-on-the-phone dependency, which was the main complaint.
- **App calls the MCP `get_budget` tool** — rejected: MCP is the agent's channel; a REST route is trivial for Android and still calls the same engine function, so ADR-0003 holds.
- **DCR at first launch** — rejected: a fixed client is fewer moving parts, and creating it after the access-token template avoids Stytch's snapshot-at-creation trap.

## Consequences

- Bank figures are reachable from the public internet, guarded only by the Stytch JWT and the email→Member allowlist. A bug in that middleware now exposes figures, not just MCP tools; route tests must cover 401/403 on every `/api` route.
- Each `/api` route returns exactly what its MCP tool returns, from the same engine function. The app formats cents for display; it does no money math.
- A failed token refresh shows "Sign in" on the widget, never a stale number. Stale data (`stale` from Data-as-of) stays a separate, greyed state.
- The app polls (every ~3h, after local midnight, on open) and never triggers an Akahu sync; the nightly cron and the AI `force` refresh own syncing.
- The Android project lives in `android/` in this repo, outside the pnpm workspace, so one commit can change both ends of the contract.

## Amendment (19 Oct 2026): HTTPS relay for the redirect

Stytch rejects redirect URLs that do not start with `http://` or `https://`, so the Connected App cannot register `nz.foster.budget:/oauth/callback`. The registered redirect is `<PUBLIC_URL>/oauth/android-callback`, a static page in `auth-page/`. It forwards the query string to `nz.foster.budget:/oauth/callback`, and shows an "Open Budget" button in case the browser blocks the automatic hand-off.

- The authorization code passes through a page on our host. PKCE keeps it useless without the verifier, which never leaves the phone.
- **Android App Links** (the app claims the HTTPS URL directly) — rejected for now: it needs `/.well-known/assetlinks.json` with each signing key's fingerprint, sign-in breaks silently if verification fails, and Custom Tabs do not reliably hand a server redirect to an App Link.

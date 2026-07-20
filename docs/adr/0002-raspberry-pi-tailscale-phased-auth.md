# Self-host on a Raspberry Pi over Tailscale, with phased auth

We host the single server (ADR-0001) on an always-on **Raspberry Pi** with a **local sqlite file**, using **Tailscale** as the network backbone, rather than a cloud host with managed libSQL/Turso. This keeps bank data on hardware we control, honours the "use sqlite" intent literally, and costs almost nothing. Auth is **phased** because the two front-ends have very different reachability.

## Considered Options

- **Cloud host + Turso/libSQL** — always-on, but puts bank transactions in a third party's cloud and adds cost.
- **Local-only per user** — rejected in ADR-0001 (diverging budgets; ChatGPT can't reach it).

## Consequences

- **Phase 1 (Claude, private):** Mac and Pi share a tailnet; Claude Desktop connects via a local `stdio→HTTP` bridge (`mcp-remote`) to the Pi's MagicDNS name. No public exposure and **no OAuth** — WireGuard is the auth.
- **Phase 2 (ChatGPT, public):** because OpenAI's servers can't reach the tailnet, we expose only `/mcp` publicly via **Tailscale Funnel** (or Cloudflare Tunnel) and add **OAuth 2.1 via a managed IdP** (Auth0/Stytch/Clerk), mapping authenticated email → Member. OAuth is the only auth both clients reliably support; static API keys are flaky on both.
- The Pi must stay powered for the wife's (Phase 2) access; acceptable for a home box.

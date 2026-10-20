# Akahu budgeting MCP

Run your household budget as a conversation with an AI, grounded in real bank
data. A single [MCP](https://modelcontextprotocol.io) server (TypeScript) connects
to [Akahu](https://akahu.nz) (NZ open banking), caches Accounts and Transactions in
local SQLite, and exposes tools that compute **every budgeting number
server-side** — so the AI supplies judgment, never arithmetic (ADR-0003).

You talk to it from Claude or ChatGPT: create monthly budgets, categorize and
track spending, decide whether a purchase fits, and generate reports.

> This README is a **setup guide** you can follow end to end to stand up your own
> instance. It uses placeholders like `<your-host>` — substitute your own values.

---

## How it works

```
┌─────────────┐     MCP over HTTP      ┌──────────────────────────┐     Akahu API
│ Claude /    │ ─────────────────────▶ │  akahu-budget-mcp server │ ──────────────▶ your banks
│ ChatGPT     │   (tools/list, call)   │  + SQLite cache          │  (nightly sync)
└─────────────┘                        └──────────────────────────┘
```

There are **two ways to reach the server**, and you can run either or both:

| Mode | Who it's for | Auth | How |
|------|--------------|------|-----|
| **Phase 1 — private** | Claude Desktop on your own machine | none needed — the network is the boundary | [Tailscale](https://tailscale.com) `serve` over your private tailnet |
| **Phase 2 — public** | ChatGPT, or Claude from anywhere | OAuth 2.1 (Stytch issues tokens; the server only validates them) | Tailscale `funnel` (public HTTPS) + a small hosted consent page |

Phase 2 is **opt-in**: with no `PUBLIC_PORT` set, only the private listener binds
and Phase 1 is unaffected.

**Stack:** Node 22+, `@modelcontextprotocol/sdk` (Streamable HTTP), better-sqlite3
+ Drizzle, `node-cron`, `zod`, `vitest`, pnpm. Phase-2 auth uses `jose`; the consent
page (`auth-page/`) is Vite + React + Stytch. (ADR-0008.)

---

## Prerequisites

- **Node 22+** and **pnpm** (`corepack enable` gets you pnpm).
- An **Akahu** account with a [Personal App](https://my.akahu.nz) per household
  member whose accounts you want to include — each gives you an `app_token` +
  `user_token` pair.
- A **host to run it on.** Anything that stays on works; this repo is set up for a
  **Raspberry Pi**. A [Tailscale](https://tailscale.com) account is used for both
  the private path and the public Funnel.
- **Phase 2 only:** a [Stytch](https://stytch.com) account (free tier is fine) with
  a **B2B** project.

---

## Part 1 — Run it locally (Phase 1)

```bash
git clone <this-repo> && cd akahu-budget-mcp
pnpm install
cp .env.example .env      # then edit .env (see below)
pnpm build
pnpm start                # migrates the DB on startup, syncs Akahu, serves /mcp
```

Minimum `.env` to get going — one numbered credential trio per member:

```bash
HOST=127.0.0.1
PORT=3000
DATABASE_PATH=./data/budget.sqlite
HOME_CURRENCY=NZD

AKAHU_MEMBER_NAME_1=Alex
AKAHU_APP_TOKEN_1=app_token_xxx
AKAHU_USER_TOKEN_1=user_token_xxx
# Add _2, _3, … for more members:
# AKAHU_MEMBER_NAME_2=Sam
# AKAHU_APP_TOKEN_2=app_token_yyy
# AKAHU_USER_TOKEN_2=user_token_yyy
```

Tokens live in memory only and are never logged or returned by any tool. The full
list of settings (`READ_ONLY`, `BUDGET_MONTH_START_DAY`, `SYNC_CRON`, …) is in
`.env.example`. Migrations apply automatically on startup; `pnpm db:migrate` runs
them standalone.

Verify:

```bash
curl http://127.0.0.1:3000/healthz        # {"ok":true}
pnpm test                                 # full suite
```

### Connect Claude Desktop (private, over Tailscale)

1. Install Tailscale on both the host and the machine running Claude Desktop; join
   the same tailnet.
2. On the host, expose the local port to your tailnet:
   ```bash
   sudo tailscale serve --bg --http=80 http://127.0.0.1:3000
   ```
3. In Claude Desktop's config (`claude_desktop_config.json`), add the server via
   [`mcp-remote`](https://www.npmjs.com/package/mcp-remote):
   ```json
   {
     "mcpServers": {
       "budget": {
         "command": "npx",
         "args": ["mcp-remote", "http://<your-host>.<your-tailnet>.ts.net/mcp", "--allow-http"]
       }
     }
   }
   ```
   (`--allow-http` is needed only because this path is plain HTTP over the tailnet;
   the tailnet itself is the security boundary — ADR-0002.)

That's a complete, private, single-user setup. Everything below is optional.

---

## Part 2 — Deploy to a Raspberry Pi

Runs the server as a `systemd` service that restarts on boot/failure.

```bash
# On the Pi: clone to ~/akahu-budget-mcp, create .env, then:
pnpm install && pnpm build

# Install the service (edit User= and paths in the unit first):
sudo cp deploy/akahu-budget-mcp.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now akahu-budget-mcp
journalctl -u akahu-budget-mcp -f          # logs
```

Update flow: `git pull && pnpm install && pnpm build && sudo systemctl restart akahu-budget-mcp`.

---

## Part 3 — Public access for ChatGPT / remote Claude (Phase 2)

This exposes `/mcp` on the public internet, guarded by OAuth 2.1. **Stytch is the
Authorization Server; this app is only a token-validating Resource Server** — it
implements no `/authorize`, `/token`, or client registration of its own
(ADR-0010). Because Stytch doesn't host the OAuth consent page for Connected Apps,
this repo ships one: `auth-page/`, a tiny Vite + React SPA that mounts Stytch's
`<B2BIdentityProvider>` at `/oauth/authorize`.

**The full, ordered walkthrough — with every Stytch dashboard field and the
Tailscale Funnel commands — is in [`deploy/phase2-funnel-oauth.md`](deploy/phase2-funnel-oauth.md).**
The shape:

1. **Stytch (B2B project):** create an Organization, add each person as a **Member**
   (their sign-in email must match the allowlist below), enable **Dynamic Client
   Registration**, set the access-token template, and set the Authorization URL to
   your deployed consent page. (The doc calls out three easy-to-miss traps — see
   "Gotchas" below.)
2. **Build & deploy the consent page** (build on a real machine, not the 1 GB Pi):
   ```bash
   cp auth-page/.env.example auth-page/.env    # set VITE_STYTCH_PUBLIC_TOKEN
   pnpm --filter auth-page build               # → auth-page/dist/
   # ship auth-page/dist/ + auth-page/serve.mjs to the host, then run it under
   # systemd (deploy/auth-page.service) on 127.0.0.1:8088
   ```
3. **Enable the server's public listener** — add to the host's `.env`:
   ```bash
   PUBLIC_PORT=3443
   STYTCH_PROJECT_ID=<your project id>
   AUTH_ISSUER=https://<slug>.customers.stytch.dev
   STYTCH_JWKS_URL=https://<slug>.customers.stytch.dev/.well-known/jwks.json
   AUTH_AUDIENCE=<your project id>                    # aud is the project_id, not the URL
   AUTH_RESOURCE=https://<your-host>.<your-tailnet>.ts.net   # bare origin
   AUTH_EMAIL_CLAIM=email
   AUTH_MEMBER_EMAILS=Alex:alex@example.com,Sam:sam@example.com  # the allowlist
   TAILNET_DEFAULT_MEMBER=Alex
   ```
   The names in `AUTH_MEMBER_EMAILS` must **exactly match** existing Member names
   (`AKAHU_MEMBER_NAME_*`) or an auth-only Member is created. Restart the server.
4. **Expose it with Tailscale Funnel** (path-routed on 443):
   ```bash
   sudo tailscale funnel --bg --https=443 --set-path=/oauth http://127.0.0.1:8088
   sudo tailscale funnel --bg --https=443 http://127.0.0.1:3443
   ```
   (Funnel must be enabled once for your tailnet in the Tailscale admin console.)
5. **Connect a client** to `https://<your-host>.<your-tailnet>.ts.net/mcp`:
   - **ChatGPT** (Plus/Pro, personal account): Settings → Apps & Connectors →
     Developer mode → new connector → Server URL + OAuth (endpoints auto-discover).
   - **Claude** (personal account): add it as a custom connector.

### How a request is authorized

Missing/invalid token ⇒ **401** with a `WWW-Authenticate` challenge pointing at the
RFC 9728 metadata; the client discovers Stytch, registers via DCR, runs PKCE, and
the user signs in on the consent page. A valid token whose email isn't in the
allowlist ⇒ **403**. On success the request is attributed to that Member.

### Gotchas (learned the hard way — full detail in the deploy doc)

- **Org-managed Claude/ChatGPT plans usually block custom connectors** by admin
  policy. Use a **personal** account.
- **Stytch Frontend SDK:** add your consent-page origin to **Authorized domains**
  and enable Email OTP, or the login form errors.
- **Access-token template variable is UNQUOTED:** `{ "email": {{ member.email_address }} }`
  — Stytch auto-quotes it and rejects `"{{ … }}"`.
- **The template is snapshotted onto each client at registration time.** If you
  connect a client before the template is right, its tokens never carry `email` —
  **delete and re-add the connector** (a plain reconnect reuses the stale client).
- Tool-calling for ChatGPT developer-mode connectors is currently **web-only**;
  mobile can display the tools but not invoke them.

---

## The AI skills (Claude slash commands)

Four guided flows live **server-side** and are fetched via `get_workflow_guide`, so
Claude and ChatGPT run the identical logic (ADR-0006). Thin Claude skills in
`skills/` wrap them as `/slash` commands:

- `create-budget` — set income + per-category allocations for a month
- `review-spending` — clear uncategorized txns, spot overspent envelopes
- `plan-purchase` — decide whether a purchase fits, then reallocate on approval
- `monthly-report` — a structured monthly report

---

## Tools

Reads carry a `data_as_of` stamp; writes are audited and refused in read-only mode.

- **Accounts/Transactions:** `list_accounts`, `list_transactions`, `search_transactions`, `refresh`
- **Categorization:** `list_categories`, `list_uncategorized`, `manage_categories`, `categorize_transaction`, `set_category_rule`
- **Income:** `list_income_streams`, `manage_income_streams`, `set_income_rule`, `classify_income`, `list_unclassified_income`, `income_coverage`
- **Budget:** `get_budget`, `create_budget_for_period`, `set_allocation`, `set_expected_income`, `reallocate`
- **Purchases & planning:** `evaluate_purchase`, `plan_period`, `add_planned_purchase`, `list_planned_purchases`, `update_planned_purchase`, `mark_purchased`, `drop_planned_purchase`
- **Bills:** `list_bills`, `manage_bills`, `get_upcoming_bills`
- **Reports & guidance:** `get_period_summary`, `get_workflow_guide`
- **Settings:** `get_settings`, `set_setting`

All amounts are integer minor units (cents) paired with an explicit currency; the
server owns all arithmetic (ADR-0003).

---

## Development

```bash
pnpm test            # vitest — all suites (never touches live Akahu)
pnpm typecheck
pnpm --filter auth-page test   # consent-page static-server smoke tests
```

Tests use two seams: **Seam 1** — the MCP tool boundary (seed a temp SQLite,
invoke a tool, assert structured output); **Seam 2** — the Akahu client port
(inject recorded responses, assert idempotent sync).

## Learn more

- `CONTEXT.md` — the domain language (Household, Member, Envelope, Income Stream, …). Read this first to understand the model.
- `docs/adr/` — the architecture decisions (0001–0010).
- `deploy/phase2-funnel-oauth.md` — the complete Phase-2 public-access runbook.
- `.scratch/` — the working spec and tickets.

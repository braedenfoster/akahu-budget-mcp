# Stytch Connected Apps as an OAuth AS for our remote MCP Resource Server

Research date: 2026-07-22. Sources are **primary only**: Stytch docs (`stytch.com/docs`), the MCP authorization spec (`modelcontextprotocol.io`), and the relevant RFCs. Blog posts were used only to locate primary docs. Where a claim could only be partially verified from docs, it is flagged as **needs live-token test**.

Our setup: self-hosted TypeScript MCP server acting **only** as an OAuth 2.1 token-validating Resource Server (RS). Stytch is the Authorization Server (AS). Project domain (Test env): `https://<slug>.customers.stytch.dev`. Public MCP endpoint: `https://<your-host>.<your-tailnet>.ts.net:8443/mcp`. Currently a **B2B** project.

---

## TL;DR / Decision

- **A self-hosted authorization/consent page is UNAVOIDABLE.** Stytch does not host the OAuth authorization page for Connected Apps. You must mount Stytch's `<IdentityProvider />` (Consumer) or `<B2BIdentityProvider />` (B2B) React component (or the equivalent headless SDK methods) on a page *in your own web app*, behind a login guard, and put that page's URL in the dashboard "Authorization URL" field. Until that field is set, `/.well-known/oauth-authorization-server` (and `/.well-known/openid-configuration`) return HTTP 400 — which is exactly the blocker you hit. There is **no** Stytch-hosted-page option that removes the frontend requirement.
- **Recommendation: STAY on B2B** (do not create a new Consumer project). The deciding factor is the email claim: **B2B exposes `{{ member.email_address }}` as a first-class custom-claim-template variable; Consumer does not expose any email variable at all** (Consumer templates only offer `user.external_id`, `user.user_id`, `user.full_name`, RBAC, and `trusted_metadata`). On Consumer you would have to shove the email into `trusted_metadata` or `external_id` and reference it indirectly. Since your RS keys off email, B2B is the lower-friction path. The B2B cost is modest: you must have one Organization and add your 2 users as Members. You **cannot convert** a project's type in place — switching would mean a brand-new project + data migration.
- **Access tokens ARE JWTs** (RS256), verifiable against the project JWKS — no introspection needed. Confirmed live: the JWKS endpoint on your project already serves an RS256 key.
- **`iss` = `https://<project-domain>`** and **`aud` = `["<PROJECT_ID>"]`** (an array containing the Stytch project_id — *not* your MCP URL). Set your RS's expected audience to the **project_id**, not the resource URL.
- **Email is NOT in the access token by default.** OIDC scopes (`email`) only populate the **ID token / UserInfo**, not the access token. You must add email via the Connected App **access token template** (the dashboard field currently showing `{}`).
- **Stytch does not appear to implement RFC 8707 resource→audience binding.** `aud` stays fixed to the project_id regardless of the client's `resource` parameter. This is acceptable here because one project == one MCP server, so project_id is a de-facto audience; but it is a deviation from the literal MCP-spec expectation and should be **tested** to confirm Stytch accepts-and-ignores the `resource` param rather than erroring.

---

## 1. Authorization URL / IdP page — is a self-hosted frontend required?

**Required. Yes.** Stytch does not host the authorization page for Connected Apps; your app must host one of Stytch's IdP components (or drive the headless SDK).

- MCP overview (Consumer): *"Your application is responsible for hosting one of the following Stytch components to handle the OAuth Consent step: `<IdentityProvider />` React Component for Consumer applications [or] `<B2BIdentityProvider />` React Component for B2B applications."* and *"The `authorization_endpoint` is the location of a web page hosting the Stytch `<B2BIdentityProvider />` or `<IdentityProvider />` React component."*
  Source: https://stytch.com/docs/guides/connected-apps/mcp-server-overview
- Getting started: *"Enter the URL where the component is mounted into the Authorization URL field in the Connected Apps section of the Stytch Dashboard."*
  Source: https://stytch.com/docs/guides/connected-apps/getting-started
- What the component does (Consumer IdP): *"The `IdentityProvider` function renders UI to enable the logged-in user to perform an OAuth Authorization flow with a pre-registered Connected App. The UI component will automatically parse out OAuth related fields from the query params, such as `client_id`, `redirect_uri`, `scope`, and `state`."* — and it requires the user to already be logged in (mount it behind a login guard).
  Source: https://stytch.com/docs/sdks/idp-ui-configuration
- B2B equivalent: *"The `B2BIdentityProvider` component enables logged-in organization members to complete an OAuth flow with a pre-registered Connected App."*
  Source: https://stytch.com/docs/b2b/sdks/idp-ui-configuration
- **Headless option (still your frontend, just not the prebuilt React UI):** *"You can use the headless SDK methods to parse the OAuth request, start authorization, and submit the result from your own components."*
  Source (consent management): https://stytch.com/docs/connected-apps/resources/consent-management

**Minimal implementation.** A single authenticated route in a small web app (e.g. a tiny React/Vite or Next page) that:
1. Requires the user to be logged in (Stytch login) — wrap in a `withLoginRequired`-style guard.
2. Renders `<B2BIdentityProvider />` (B2B) at a fixed path, e.g. `/oauth/authorize`. The component reads `client_id`, `redirect_uri`, `scope`, `state`, `code_challenge`, `resource` from the query string and renders the consent screen.

**What to put in "Authorization URL":** the absolute URL of that page, e.g. `https://<your-app-host>/oauth/authorize`. Docs example: *"set the authorization URL … to something like `http://localhost:3000/oauth/authorize`."* (path is your choice; it just has to match where the component is mounted).
Source: https://stytch.com/docs/guides/connected-apps/existing-auth-system

> **Consequence for the blocker:** the 400 `authorization_endpoint_not_configured_for_project` will not clear until this field points at a real, reachable page hosting the component. There is no way to skip building this page.

---

## 2. B2B vs Consumer for a 2-user MCP RS

**Recommendation: stay B2B** given the email requirement (see §4). Consumer is conceptually simpler (users only, no orgs) but its custom-claim template has **no email variable**.

- Consumer template variables (no email): `{{ user.external_id }}`, `{{ user.user_id }}`, `{{ user.full_name }}`, `{{ user.rbac.roles }}`, `{{ user.rbac.$RESOURCE_ID.actions }}`, `{{ user.trusted_metadata.$PATH }}`.
  Source: https://stytch.com/docs/consumer-auth/manage-sessions/custom-claims and https://stytch.com/docs/guides/sessions/custom-claim-templates
- B2B template variables (includes email): `{{ member.external_id }}`, `{{ member.member_id }}`, `{{ member.name }}`, **`{{ member.email_address }}`**, `{{ member.rbac.roles }}`, `{{ member.rbac.$RESOURCE_ID.actions }}`, `{{ member.trusted_metadata.$PATH }}`, plus `{{ organization.* }}`.
  Source: https://stytch.com/docs/b2b/guides/sessions/resources/custom-claim-templates

**What differs in the Connected Apps / MCP flow:**
- Component: `<IdentityProvider />` (Consumer) vs `<B2BIdentityProvider />` (B2B). Both parse the same OAuth query params. B2B is scoped to *organization members*, so the logged-in principal is a Member within an Organization; the subject (`sub`) is the member/user id in both cases. (Sources: the two `idp-ui-configuration` pages above.)
- B2B requires an Organization to exist and the 2 users to be Members of it; Consumer just needs the 2 Users. This is the only real extra setup for B2B.

**Can you switch a project's type?** No in-place conversion. Stytch's guidance is to **create a new project** of the desired type and migrate; there is a dedicated Consumer→B2B *migration* guide (implying separate projects), not a toggle.
Source: https://stytch.com/docs/b2b/guides/migrations/migrating-from-consumer-to-b2b (and project creation is where type is chosen: https://stytch.com/docs/workspace-management/pwa/create-project). Since we're already B2B and B2B is the recommendation, no switch is needed.

---

## 3. Access token = JWT verifiable via JWKS?

**Yes — JWT, RS256, verifiable via the project JWKS. No introspection required.**

- Access-token object: it is a JWT with standard claims (`iss`, `sub`, `aud`, `exp`, `nbf`, `iat`, `jti`, `scope`).
  Source: https://stytch.com/docs/api/connected-app-access-token
- JWKS: *"JWKS can be used to validate your Connected App's access tokens and ID tokens"*; keys rotate ~every 6 months with a 1-month overlap.
  Source: https://stytch.com/docs/api/connected-app-jwks
- **Live-verified on our project:** `GET https://<slug>.customers.stytch.dev/.well-known/jwks.json` returns a JWKS with `kty: RSA`, `alg: RS256`, `use: sig`, `kid: jwk-test-<kid>`. (Fetched 2026-07-22.)

---

## 4. Email claim — how to get email into the access token

**Email is NOT in the access token by default.** The OIDC `email` scope only affects the **ID token and UserInfo**, not the access token:

- *"If the `email` scope is granted, the `email` and `email_verified` claims will be returned in the id_token"* (and UserInfo).
  Source: https://stytch.com/docs/guides/connected-apps/oauth-scopes
- The access-token example payload does **not** contain an email field even when `scope` includes `email`.
  Source: https://stytch.com/docs/api/connected-app-access-token

**To get email into the access token, use the Connected App "Access token template" (the dashboard field showing `{}`)** — custom claims injected via Stytch's claim-template markup:

- Template markup: *"uses `{{ variable }}` syntax to denote information that should be passed in at runtime"* and *"The content of the access token custom claims template must be a valid JSON object."*
  Source: https://stytch.com/docs/b2b/guides/sessions/resources/custom-claim-templates
- **B2B email variable:** `{{ member.email_address }}` (see §2 variable list, same source).

**Template to add for us (B2B):**
```json
{ "email": "{{ member.email_address }}" }
```
This makes the access token carry a top-level `email` claim → our RS reads `AUTH_EMAIL_CLAIM = "email"`. (If a namespaced claim is preferred to avoid collisions, use e.g. `{ "https://budget-ai/email": "{{ member.email_address }}" }` and set `AUTH_EMAIL_CLAIM` to match.)

> **Open question (needs live-token test):** the `{{ member.email_address }}` variable is documented for **session** custom-claim templates. The Connected App **access-token** template field is the same markup engine per Stytch's docs, but I could not find a doc page that *explicitly* enumerates the variable set for the Connected-App access-token template specifically. Verify with a real token that `{{ member.email_address }}` resolves in the Connected App access-token context and lands in the access token (not just the session/ID token).

---

## 5. issuer (`iss`) + JWKS URL for a `*.customers.stytch.dev` project

- **`iss` = `https://<project-domain>`.** Access-token object example shows `"iss": "https://${projectDomain}"`.
  Source: https://stytch.com/docs/api/connected-app-access-token
  → For us: **`iss = https://<slug>.customers.stytch.dev`**.
  (Note: the object-doc prose also says the default issuer is "your project's Custom Domain, or `stytch.com/${projectId}`" — but the concrete example and the FastMCP MCP guide both use the project domain. Since we have no custom domain, the `customers.stytch.dev` project domain is the issuer. **Confirm the exact string once `/.well-known/oauth-authorization-server` is live** — expect no trailing path.)
- **`jwks_uri` = `<project-domain>/.well-known/jwks.json`.** FastMCP example: `jwks_uri = f"{STYTCH_DOMAIN}/.well-known/jwks.json"`.
  Source: https://stytch.com/docs/guides/connected-apps/mcp-server-overview
  → For us: **`https://<slug>.customers.stytch.dev/.well-known/jwks.json`** (live-verified, §3).

The RFC 8414 AS-metadata doc (`/.well-known/oauth-authorization-server`) will expose `issuer`, `authorization_endpoint`, `token_endpoint`, `registration_endpoint`, `jwks_uri` once the Authorization URL is set. It currently returns **HTTP 400** on our project (same root cause as `/.well-known/openid-configuration`, also 400), consistent with the blocker.

---

## 6. Audience (`aud`) and RFC 8707 resource indicators

- **`aud` = `["<PROJECT_ID>"]`** — an array containing the Stytch **project_id**, not the MCP URL and not the DCR client_id. Access-token example: `"aud": ["PROJECT_ID"]`.
  Source: https://stytch.com/docs/api/connected-app-access-token
- FastMCP / MCP guide confirms the RS should set **`audience = STYTCH_PROJECT_ID`**.
  Source: https://stytch.com/docs/guides/connected-apps/mcp-server-overview
- **RFC 8707:** no Stytch primary doc found stating Connected Apps mints `aud` from the client's `resource` parameter. Nothing in the MCP overview or access-token object indicates resource→audience binding; `aud` is documented as fixed to the project_id. So the client can send `resource=<our MCP URL>` (and per the MCP spec it MUST — see §7), but you should **not** expect `aud` to become the MCP URL.

> **Caveat / discrepancy:** the access-token *object* page's prose describes `aud` as "the audience (`client_id`)", while its own example shows `["PROJECT_ID"]` and the MCP guide says project_id. Treat **project_id** as authoritative for the Connected-Apps authorization_code flow (the "client_id" wording appears to describe the generic/M2M case). **Confirm with a real token.**

**RS impact:** set expected audience to the **project_id**, not the resource URL. See §9.

---

## 7. DCR + metadata + the discovery chain (does it match what ChatGPT/Claude expect?)

**Yes, the chain matches the MCP spec**, with one nuance about `aud` (§6).

Stytch side:
- **RFC 8414 AS metadata** at `/.well-known/oauth-authorization-server`, *hosted by Stytch* (not our server), exposing `authorization_endpoint`, `token_endpoint`, `registration_endpoint`. Source: https://stytch.com/docs/guides/connected-apps/mcp-server-overview
- **DCR (RFC 7591)** supported, opt-in: *"Dynamic Client Registration … must be enabled in the Connected Apps dashboard"*; DCR-created clients are public. Same source.
- Our RS hosts **RFC 9728 PRM** at `/.well-known/oauth-protected-resource` with `resource` = our MCP URL and `authorization_servers` = `[<Stytch project domain>]`. Source (field defs): same MCP overview — *"`resource`: … the location of your MCP Server"*, *"`authorization_servers`: … your Stytch PROJECT_DOMAIN"*.

MCP spec side (what ChatGPT/Claude do), all from https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization :
- *"MCP servers **MUST** implement OAuth 2.0 Protected Resource Metadata (RFC9728) … MCP clients **MUST** use … Protected Resource Metadata for authorization server discovery."*
- *"MCP servers **MUST** use the HTTP header `WWW-Authenticate` when returning a 401 … to indicate the location of the resource server metadata URL."*
- *"MCP clients **MUST** follow the OAuth 2.0 Authorization Server Metadata RFC8414 … to obtain the information required to interact with the authorization server."*
- Flow: 401 + `WWW-Authenticate` → client GETs our `/.well-known/oauth-protected-resource` → reads `authorization_servers` → GETs Stytch `/.well-known/oauth-authorization-server` → (optional DCR `POST /register`) → PKCE authorize → token → call MCP with `Authorization: Bearer`.

**Resource parameter (RFC 8707) — the one nuance:** *"MCP clients **MUST** implement Resource Indicators … The `resource` parameter … **MUST** be included in both authorization requests and token requests … **MUST** use the canonical URI of the MCP server … MCP clients **MUST** send this parameter regardless of whether authorization servers support it."* And: *"MCP servers **MUST** validate that access tokens were issued specifically for them as the intended audience."* Because Stytch sets `aud = project_id` (not the resource URL), our RS validates `aud == project_id`; since the project is dedicated to this one MCP server, project_id functions as the intended-recipient audience. This satisfies the spec's audience-binding intent but not a literal "resource URL in `aud`". **Needs test:** confirm Stytch *accepts and ignores* the `resource` param (does not 400/reject it).

**Action item for our RS:** ensure we return `401` with a `WWW-Authenticate` header pointing at our PRM URL — required by the spec and by ChatGPT/Claude's discovery.

---

## 8. PKCE / grant types / token-endpoint auth for public DCR clients

All from https://stytch.com/docs/guides/connected-apps/mcp-server-overview unless noted:
- **PKCE:** required; clients send `code_challenge` + `code_challenge_method: "S256"` on authorize and `code_verifier` at token exchange. (MCP spec also mandates PKCE.)
- **Grant types:** `authorization_code` and `refresh_token`. (*"MCP Clients request access … through the `authorization_code` grant."* / DCR clients register `grant_types: ["authorization_code", "refresh_token"]`.)
- **Client type / token-endpoint auth:** DCR-created clients are **public** ("Third Party Public"), i.e. **no client secret**; they rely on PKCE. Expected `token_endpoint_auth_method` for these is `none`.
  Source: https://stytch.com/docs/guides/connected-apps/mcp-servers
  > **Needs test:** confirm `token_endpoint_auth_methods_supported` in the live AS metadata includes `"none"` — the metadata doc is currently 400 on our project so this could not be read directly.
- **Refresh-token rotation:** MCP spec requires AS to rotate refresh tokens for public clients; verify Stytch does (expected, but confirm on a real refresh).

---

## 9. Concrete config for us

Assuming we **stay on B2B** (recommended).

| Env var | Value | Notes |
|---|---|---|
| `AUTH_ISSUER` | `https://<slug>.customers.stytch.dev` | = `iss` (`https://<project-domain>`). Confirm exact string once AS metadata is live. |
| `STYTCH_JWKS_URL` | `https://<slug>.customers.stytch.dev/.well-known/jwks.json` | Live-verified, RS256. |
| `AUTH_AUDIENCE` | `<STYTCH_PROJECT_ID>` (e.g. `project-test-xxxxxxxx-...`) | **project_id, NOT the MCP URL.** `aud` is an array — accept if project_id ∈ `aud`. |
| `AUTH_RESOURCE` | `https://<your-host>.<your-tailnet>.ts.net:8443/mcp` | Goes in our RFC 9728 PRM `resource` field and is what clients send as `resource`. Does **not** appear in `aud`. |
| `AUTH_EMAIL_CLAIM` | `email` | Must match the claim name we define in the access-token template below. |
| `STYTCH_PROJECT_ID` | `<from dashboard → Project settings>` | Also the `AUTH_AUDIENCE` value. |

**PRM document our RS serves at `/.well-known/oauth-protected-resource`:**
```json
{
  "resource": "https://<your-host>.<your-tailnet>.ts.net:8443/mcp",
  "authorization_servers": ["https://<slug>.customers.stytch.dev"],
  "scopes_supported": ["openid", "email", "profile"]
}
```
Also return `401` + `WWW-Authenticate: Bearer resource_metadata="https://<your-host>.<your-tailnet>.ts.net:8443/.well-known/oauth-protected-resource"` on unauthenticated requests.

**Stytch dashboard → Connected Apps → Settings:**
- **Authorization URL:** URL of a page in a small web app you host that mounts `<B2BIdentityProvider />` behind a login guard, e.g. `https://<your-app-host>/oauth/authorize`. (This clears the `authorization_endpoint_not_configured_for_project` 400.)
- **Access token template content** (replace the `{}`):
  ```json
  { "email": "{{ member.email_address }}" }
  ```
- **Dynamic Client Registration:** enabled (already done).

**RS validation logic:** verify JWT signature via JWKS (RS256) → check `iss == AUTH_ISSUER`, `AUTH_AUDIENCE ∈ aud`, `exp`/`nbf` → read `email` claim → map to allowlist.

---

## Open questions — resolvable only by testing with a real token / live metadata

1. **Email in the access token:** confirm `{{ member.email_address }}` in the Connected-App *access-token* template actually lands as a claim in the **access token** (docs enumerate this variable for session templates; the access-token template is the same engine but not separately enumerated).
2. **Exact `iss` string:** confirm `https://<slug>.customers.stytch.dev` with no trailing path once `/.well-known/oauth-authorization-server` returns 200.
3. **`aud` value:** confirm it is `["<project_id>"]` for the authorization_code (user) flow, reconciling the object-doc's "client_id" prose vs its `["PROJECT_ID"]` example.
4. **RFC 8707 `resource` param handling:** confirm Stytch *accepts and ignores* the client's `resource` param (does not reject), and that `aud` stays = project_id.
5. **Public-client token auth:** confirm `token_endpoint_auth_methods_supported` includes `"none"` and that refresh-token rotation is on (metadata currently 400).

---

## Source index (primary)

- Stytch MCP server overview (Consumer): https://stytch.com/docs/guides/connected-apps/mcp-server-overview
- Stytch MCP server overview (B2B): https://stytch.com/docs/b2b/guides/connected-apps/mcp-server-overview
- Stytch MCP auth overview: https://stytch.com/docs/connected-apps/guides/mcp-auth-overview
- Connected App access-token object: https://stytch.com/docs/api/connected-app-access-token
- Connected App JWKS: https://stytch.com/docs/api/connected-app-jwks
- OAuth scopes (OIDC claims → ID token/UserInfo): https://stytch.com/docs/guides/connected-apps/oauth-scopes
- Custom claim templates (B2B, incl. `member.email_address`): https://stytch.com/docs/b2b/guides/sessions/resources/custom-claim-templates
- Custom claims (Consumer, no email var): https://stytch.com/docs/consumer-auth/manage-sessions/custom-claims and https://stytch.com/docs/guides/sessions/custom-claim-templates
- IdentityProvider config (Consumer): https://stytch.com/docs/sdks/idp-ui-configuration
- B2BIdentityProvider config: https://stytch.com/docs/b2b/sdks/idp-ui-configuration
- Consent management (headless SDK option): https://stytch.com/docs/connected-apps/resources/consent-management
- Getting started (Authorization URL field): https://stytch.com/docs/guides/connected-apps/getting-started
- Existing auth system (Authorization URL example): https://stytch.com/docs/guides/connected-apps/existing-auth-system
- Consumer→B2B migration (implies no in-place type switch): https://stytch.com/docs/b2b/guides/migrations/migrating-from-consumer-to-b2b
- MCP authorization spec (2025-06-18): https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization
- RFC 8707 Resource Indicators: https://www.rfc-editor.org/rfc/rfc8707.html
- RFC 9728 Protected Resource Metadata: https://datatracker.ietf.org/doc/html/rfc9728
- RFC 8414 AS Metadata: https://datatracker.ietf.org/doc/html/rfc8414
- Live (fetched 2026-07-22): `https://<slug>.customers.stytch.dev/.well-known/jwks.json` (200, RS256); `/.well-known/oauth-authorization-server` and `/.well-known/openid-configuration` (both 400 pre-config).

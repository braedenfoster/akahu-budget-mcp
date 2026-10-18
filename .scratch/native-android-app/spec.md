# Spec: Native Android app (v1: Spending allowance)

Status: ready-for-agent

_Replaces the KWGT widget from the Spending allowance spec. Vocabulary follows `CONTEXT.md` (Household, Member, Period, Spending allowance, Data-as-of, Uncategorized). The governing decision is ADR-0013. Also read ADR-0003 (the server owns all money math), ADR-0005 (nightly sync) and ADR-0010 (public OAuth listener)._

## Problem Statement

The Spending allowance reaches the phones through a KWGT widget that reads `GET /widget/summary` on the tailnet. Each phone must run Tailscale. Phone browsers upgrade the URL to HTTPS 443, which is the public Funnel listener, so the route needs a separate tailnet-only `:8443` serve. KWGT cannot do arithmetic, so the server sends display strings. The setup is fiddly, both Members will not maintain it, and it cannot grow into Budget screens or edits.

## Solution

Build a native Android app for both Members.

- The app signs in once through Stytch and reads REST routes on the **public OAuth listener**. The phone needs no Tailscale.
- v1 has three parts: sign-in, a home-screen widget for the Spending allowance, and one in-app screen with the Spending allowance breakdown.
- v2 adds a read-only current Budget (`GET /api/budget`). v3 adds writes such as recategorizing a Transaction. Both are out of scope here; v3 needs its own grilling session.
- After both phones run the app for a few days, retire the tailnet route, the `:8443` serve, the display strings, and KWGT.

## User Stories

1. As a Member, I want to see the Spending allowance on my home screen without Tailscale, so that the widget works wherever my phone has internet.
2. As a Member, I want to sign in once with my email, so that I do not sign in again each time the token expires.
3. As a Member, I want the widget to show "Sign in" when my session ends, so that I never see a number from a session that no longer works.
4. As a Member, I want the widget to show the amount, the per-week figure, and days left, so that I know how fast I can spend.
5. As a Member, I want a negative amount shown in a warning colour with no per-week figure, so that an overspend is clear.
6. As a Member, I want "No budget for <month>" when the Period has no Budget, so that I am prompted to create one.
7. As a Member, I want the number greyed out with "as of <date>" when Data-as-of is old, so that a broken sync is visible.
8. As a Member, I want the last good value with an "offline" mark when the phone cannot reach the server, so that a network failure is different from a stale sync.
9. As a Member, I want an Uncategorized badge (e.g. "4 to review") when the count is above 0, so that I know when to run a spending review.
10. As a Member, I want to tap the widget to open the app, so that I can see why the number is what it is.
11. As a Member, I want the in-app screen to show flexible remaining, committed overspend, and Uncategorized spend with its count, so that I see the same breakdown Claude explains.
12. As a Member, I want the screen to show Data-as-of and when the phone last checked, so that I know how fresh each figure is.
13. As a Member, I want a refresh button and Sign out on the screen, so that I control the session.
14. As a Member, I want the widget to update after local midnight, so that days left and the per-week figure roll over.
15. As a Member, I want the app never to start an Akahu sync, so that the phone does not cause extra bank calls.
16. As a Member, I want only emails attached to a Member to read the figures, so that bank figures on the public listener stay private.
17. As a Member, I want the old KWGT path kept until the app works on both phones, so that we always have a working widget.

## Implementation Decisions

### Server: public REST routes

- Add `GET /api/spending-allowance`. It returns `{ spending_allowance }`: the same block as `get_budget.spending_allowance`, for the current Period resolved from local today in `household_timezone`.
- Mount `/api` on the **public listener only** (`buildPublicApp`). The tailnet listener does not serve it.
- Put `/api` behind the same Bearer and email→Member middleware as `/mcp`. Today `makeAuthenticateMiddleware` runs before `POST /mcp` only; extend it to `/api`.
- The route calls `computeSpendingAllowance` and serializes the result. It has no other logic.
- Leave `/api` unversioned. Both ends ship from this repo.
- Do not audit reads. Do not add rate limiting until v3 adds writes.
- Funnel already sends every path except `/oauth` to the public port. No Funnel change is needed.

### Contract

- A server test writes one example response per state to `contracts/spending-allowance.<state>.json`: `ok`, `over`, `no_budget`, and `stale`.
- Kotlin unit tests parse those files into hand-written `kotlinx.serialization` classes.
- If the shape changes, both test suites fail in the same commit.
- The app reads `*_cents` only. It formats cents with an NZD `NumberFormat`. It does no money math.

### Auth

- Create a **pre-registered first-party public Connected App** in Stytch: fixed `client_id`, PKCE, custom-scheme redirect `nz.foster.budget:/oauth/callback`.
- Create the client after the access-token template exists. Stytch snapshots the template onto each client at creation time.
- `aud` is the Stytch project_id, so `verify.ts` needs no change.
- The app uses AppAuth-Android. Sign-in opens a Custom Tab to the existing auth page (Stytch email OTP).
- Request `offline_access`. Store the refresh token encrypted with Android Keystore.
- If a refresh fails (expired, revoked, or email not attached to a Member), clear the cached figure and show "Sign in".

### App

- Kotlin, Jetpack Glance, AppAuth, `kotlinx.serialization`, WorkManager.
- `applicationId` `nz.foster.budget`, app name "Budget", `minSdk` 31 (lower it only if a phone is older than Android 12).
- The project lives in `android/` in this repo, outside the pnpm workspace.
- Distribute a sideloaded signed APK. The release keystore lives in 1Password, not the repo. Its path goes in the git-ignored `deploy/.env`.

### Widget

- One resizable widget, about 3×1. Tapping opens the app.

| State | Source | Shows |
|---|---|---|
| ok | `status = ok` | Amount, "$X / week", days left |
| over | `status = over` | Negative amount in the warning colour, no per-week figure |
| no budget | `status = no_budget` | "No budget for <month>" |
| stale | `stale = true` | The number greyed out, with "as of <Data-as-of date>" |
| signed out | Token refresh failed, or never signed in | "Sign in" |
| offline | Fetch failed (network or server down) | Last good value, small "offline" mark |

- Show the Uncategorized badge when `uncategorized_count > 0`, in every state that shows a number.
- `stale` and offline are separate failures. Stale comes from the server (old Akahu sync). Offline comes from the phone (could not reach the server).

### Refresh

- WorkManager fetches every 3 hours, with a network constraint.
- Schedule one fetch shortly after local midnight, so `days_left` and `per_week` roll over.
- Fetch when the app opens and when the Member taps refresh.
- The app never calls a sync or `force` refresh. The nightly cron owns syncing (ADR-0005).

### In-app screen

- Headline amount and per-week figure.
- Breakdown: flexible remaining, committed overspend, Uncategorized spend and count.
- Data-as-of and "last checked" (the phone's last successful fetch).
- Refresh button and Sign out.

### Retirement (after both phones run the app for a few days)

- Remove `GET /widget/summary`, `src/http/widget.ts`, and its tailnet mount.
- Remove the `:8443` `tailscale serve` from the Pi and from `deploy/phase2-funnel-oauth.md`.
- Remove `amount_display`, `per_week_display`, and `formatDollars` if nothing else uses it.
- Remove the KWGT widgets from both phones.

## Testing Decisions

- A good test drives the system through its public seam and asserts on the output.
- **Server (Seam 2, HTTP):** prior art is `test/17-widget-route.test.ts` and the ticket 13 Phase-2 listener tests.
  - `GET /api/spending-allowance` with a valid token returns the same block as `get_budget` for the same Period and clock.
  - No token gives 401. A token for an email not attached to a Member gives 403.
  - The tailnet listener does not serve `/api` (404).
  - The contract test writes the four `contracts/*.json` files and fails if they differ from the committed files.
- **App (JVM unit tests):**
  - Each `contracts/*.json` file parses into the Kotlin classes.
  - A pure function maps (response or failure, auth state) to a widget state. Test every row of the widget state table, and the Uncategorized badge.
  - Cents format as NZD, including negative values.
- Manual check on both phones: sign in, add the widget, kill the network, sign out, and wait past local midnight.

## Out of Scope

- v2: read-only Budget (`GET /api/budget`, Envelope list).
- v3: writes from the phone (recategorize a Transaction, add a Mapping Rule). This needs a grilling session on audit, read-only mode, and rate limiting.
- iOS.
- Play Store distribution.
- Push notifications.
- More frequent Akahu sync.
- Rate limiting and rejected-email auditing on the public listener (deferred in ADR-0010).

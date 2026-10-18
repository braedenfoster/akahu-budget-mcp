# 03: Stytch Connected App for the Android app

**What to build:** A pre-registered first-party public Connected App in the Stytch B2B project, so the app can run PKCE sign-in with a fixed `client_id`.

**Blocked by:** none

**Status:** ready-for-human

Spec: `.scratch/native-android-app/spec.md` (Auth)

- [ ] Confirm the access-token template is saved before you create the client (Stytch snapshots it at creation)
- [ ] Create a public Connected App with PKCE and the redirect `nz.foster.budget:/oauth/callback`
- [ ] Allow the scopes `openid email profile offline_access`
- [ ] Record the `client_id` in the git-ignored `deploy/.env` and in the Android build config (ticket 04)
- [ ] Confirm both Members' emails are attached to Members on the Pi
- [x] Add the client to `deploy/phase2-funnel-oauth.md`

## Comments

- The steps are in `deploy/phase2-funnel-oauth.md` under "Android Connected App". Only the Connected App is new; the Stytch project, Members and template are reused.
- The MCP connectors already work, so the Authorization URL is set. `/.well-known/oauth-authorization-server` should not return 400.

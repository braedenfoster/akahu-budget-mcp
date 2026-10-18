# 08: Retire the KWGT path

**What to build:** Remove the tailnet widget route, the `:8443` serve, and the display strings, once both phones have run the app for a few days.

**Blocked by:** 07, and a few days of the app working on both phones

**Status:** needs-triage

Spec: `.scratch/native-android-app/spec.md` (Retirement)

- [ ] Remove `GET /widget/summary`, `src/http/widget.ts`, and its tailnet mount, and update the route tests
- [ ] Remove `amount_display` and `per_week_display`; remove `formatDollars` if nothing else uses it
- [ ] Regenerate `contracts/*.json`; Android tests still pass
- [ ] On the Pi, remove the `:8443` `tailscale serve`
- [ ] Remove the `:8443` row and command from `deploy/phase2-funnel-oauth.md`
- [ ] Remove the KWGT widgets from both phones
- [ ] Mark the "phone widget" lines in `.scratch/spending-allowance/spec.md` as superseded by ADR-0013

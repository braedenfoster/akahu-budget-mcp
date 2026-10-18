# 05: API client and Spending allowance screen

**What to build:** The app fetches `GET /api/spending-allowance` and shows the Spending allowance with its breakdown on one screen.

**Blocked by:** 02, 04

**Status:** ready-for-agent

Spec: `.scratch/native-android-app/spec.md` (Contract, In-app screen)

- [ ] `kotlinx.serialization` classes parse every `contracts/spending-allowance.*.json` file (JVM unit test)
- [ ] The screen shows the headline amount and the per-week figure
- [ ] The screen shows flexible remaining, committed overspend, and Uncategorized spend with its count
- [ ] The screen shows Data-as-of and "last checked"
- [ ] The screen has a refresh button and Sign out
- [ ] The app formats `*_cents` as NZD, including negative values (unit test); it does no other money math
- [ ] The app fetches when it opens and caches the last good response

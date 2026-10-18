# 05: API client and Spending allowance screen

**What to build:** The app fetches `GET /api/spending-allowance` and shows the Spending allowance with its breakdown on one screen.

**Blocked by:** 02, 04

**Status:** resolved

Spec: `.scratch/native-android-app/spec.md` (Contract, In-app screen)

- [x] `kotlinx.serialization` classes parse every `contracts/spending-allowance.*.json` file (JVM unit test)
- [ ] The screen shows the headline amount and the per-week figure
- [ ] The screen shows flexible remaining, committed overspend, and Uncategorized spend with its count
- [ ] The screen shows Data-as-of and "last checked"
- [ ] The screen has a refresh button and Sign out
- [x] The app formats `*_cents` as NZD, including negative values (unit test); it does no other money math
- [x] The app fetches when it opens and caches the last good response

## Comments

- The four screen items stay unticked until a phone check. No emulator or device is available. `AllowanceScreenModelTest` covers the values the screen shows (amount, per week, breakdown, Uncategorized count, Data-as-of, last checked, failure). The Compose layout in `ui/SpendingAllowanceScreen.kt` compiles but nobody has looked at it.
- `AllowanceRepository.refresh()` is the one fetch entry point. `MainActivity` calls it in `onStart`, after sign-in, and from the Refresh button. Ticket 06 calls the same function from the widget worker.
- A 401 refreshes the token and retries once. A second 401, or a 403, signs out and clears the cache. A network failure, a 5xx, or an unreadable body keeps the cache and records the failure kind (`Offline` or `ServerError`).
- The DTOs ignore unknown keys, so `amount_display` and `per_week_display` are still accepted. Ticket 08 can remove them with no app change.

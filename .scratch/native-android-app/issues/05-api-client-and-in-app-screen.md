# 05: API client and Spending allowance screen

**What to build:** The app fetches `GET /api/spending-allowance` and shows the Spending allowance with its breakdown on one screen.

**Blocked by:** 02, 04

**Status:** resolved

Spec: `.scratch/native-android-app/spec.md` (Contract, In-app screen)

- [x] `kotlinx.serialization` classes parse every `contracts/spending-allowance.*.json` file (JVM unit test)
- [x] The screen shows the headline amount and the per-week figure
- [x] The screen shows flexible remaining, committed overspend, and Uncategorized spend with its count
- [x] The screen shows Data-as-of and "last checked"
- [x] The screen has a refresh button and Sign out
- [x] The app formats `*_cents` as NZD, including negative values (unit test); it does no other money math
- [x] The app fetches when it opens and caches the last good response

## Comments

- The four screen items stay unticked until a phone check. No emulator or device is available. `AllowanceScreenModelTest` covers the values the screen shows (amount, per week, breakdown, Uncategorized count, Data-as-of, last checked, failure). The Compose layout in `ui/SpendingAllowanceScreen.kt` compiles but nobody has looked at it.
- `AllowanceRepository.refresh()` is the one fetch entry point. `MainActivity` calls it in `onStart`, after sign-in, and from the Refresh button. Ticket 06 calls the same function from the widget worker.
- A 401 refreshes the token and retries once. A second 401, or a 403, signs out and clears the cache. A network failure, a 5xx, or an unreadable body keeps the cache and records the failure kind (`Offline` or `ServerError`).
- The DTOs ignore unknown keys, so `amount_display` and `per_week_display` are still accepted. Ticket 08 can remove them with no app change.
- 19 Oct 2026, ticket 07 phone check: the screen shows every value, and the values match `get_budget`. The Uncategorized count was 0, so the count text did not show on the phone. `AllowanceScreenModelTest` covers it.
- The screen hides the Uncategorized count when it is 0.
- The phone check found two edge-to-edge faults (targetSdk 35). The title drew under the status bar, and the system bar icons were white on the light background. `MainActivity` now calls `enableEdgeToEdge` with a light style, which gives dark system bar icons. It also pads the content clear of the system bars. A rebuilt APK on the same phone showed both fixes. Nobody has checked the fix on Android 12 to 14.

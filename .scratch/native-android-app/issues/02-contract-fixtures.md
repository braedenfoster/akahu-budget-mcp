# 02: Contract fixtures for the Spending allowance

**What to build:** A server test writes one example `/api/spending-allowance` response per state to `contracts/`. The Android tests (ticket 05) parse the same files, so a shape change breaks both suites in one commit.

**Blocked by:** 01

**Status:** resolved

Spec: `.scratch/native-android-app/spec.md` (Contract)

- [x] `contracts/spending-allowance.{ok,over,no_budget,stale}.json` exist and are committed
- [x] The files come from the real route against a fixed clock and seeded data, not hand-written JSON
- [x] The test fails if a generated response differs from the committed file
- [x] A short note in `contracts/README.md` says how to regenerate the files

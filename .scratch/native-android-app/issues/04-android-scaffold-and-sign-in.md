# 04: Android project scaffold and sign-in

**What to build:** A Kotlin Android project in `android/` that builds a signed APK and signs a Member in once through Stytch. The refresh token survives app restarts and phone reboots.

**Blocked by:** 03

**Status:** resolved

Spec: `.scratch/native-android-app/spec.md` (Auth, App)

- [x] `android/` builds with Gradle; `applicationId` `nz.foster.budget`, app name "Budget", `minSdk` 31
- [x] The release build reads the keystore path and passwords from outside the repo
- [x] AppAuth runs PKCE sign-in in a Custom Tab against the existing auth page
- [x] The app requests `offline_access` and stores the refresh token encrypted with Android Keystore
- [x] The app refreshes the access token when it expires
- [x] A failed refresh clears the token and any cached figure, and moves the app to the signed-out state
- [x] Sign out clears the token and any cached figure
- [x] Add `android/` build outputs to `.gitignore`

## Comments

- The PKCE sign-in code is in place (`auth/AppAuthSignIn.kt`), but nobody has run it end to end. It needs the real Stytch `client_id` from ticket 03 and a phone. Check it during ticket 07.
- The build reads `STYTCH_ANDROID_CLIENT_ID`, `AUTH_ISSUER`, `PUBLIC_URL`, and the `ANDROID_KEY*` values from a Gradle property, an environment variable, `android/local.properties`, or `deploy/.env`. See `android/README.md`.
- Without a client_id, a debug build still builds. The app then shows the missing keys instead of "Sign in". A release build stops with a list of the missing keys.
- Verified: `./gradlew assembleDebug testDebugUnitTest` passes (20 JVM tests). `assembleRelease` fails cleanly with no configuration, and builds a signed APK with a throwaway keystore and dummy values.
- Risks for the phone check:
  - AppAuth validates the ID token (issuer, audience, nonce) during the code exchange. If Stytch's `id_token` `iss` differs from the discovery `issuer`, the exchange fails with an ID-token error.
  - Discovery uses `AUTH_ISSUER/.well-known/openid-configuration`. That returns 400 until the Stytch Authorization URL is set.
- 19 Oct 2026, ticket 07 phone check (Pixel 8 Pro, Android 17, release APK): PKCE sign-in works end to end. Discovery, the relay hand-off (no "Open Budget" tap needed), the code exchange and the ID-token check all pass. Neither listed risk occurred.
- The first attempt failed with "redirect URL not registered". `deploy/.env` held a stale client_id, and the Stytch redirect URL had a typo (`pixelsprout1`). Braeden fixed both outside the repo.

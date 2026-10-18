# 04: Android project scaffold and sign-in

**What to build:** A Kotlin Android project in `android/` that builds a signed APK and signs a Member in once through Stytch. The refresh token survives app restarts and phone reboots.

**Blocked by:** 03

**Status:** ready-for-agent

Spec: `.scratch/native-android-app/spec.md` (Auth, App)

- [ ] `android/` builds with Gradle; `applicationId` `nz.foster.budget`, app name "Budget", `minSdk` 31
- [ ] The release build reads the keystore path and passwords from outside the repo
- [ ] AppAuth runs PKCE sign-in in a Custom Tab against the existing auth page
- [ ] The app requests `offline_access` and stores the refresh token encrypted with Android Keystore
- [ ] The app refreshes the access token when it expires
- [ ] A failed refresh clears the token and any cached figure, and moves the app to the signed-out state
- [ ] Sign out clears the token and any cached figure
- [ ] Add `android/` build outputs to `.gitignore`

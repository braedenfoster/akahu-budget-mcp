# Budget Android app

The native Android app for the Household (ADR-0013). It signs a Member in through Stytch and reads the `/api` routes on the public OAuth listener.

- `applicationId`: `nz.foster.budget`
- App name: "Budget"
- `minSdk` 31, `compileSdk` and `targetSdk` 35
- Redirect URI registered in Stytch: `<PUBLIC_URL>/oauth/android-callback` (the auth-page relay)
- App callback the relay opens: `nz.foster.budget:/oauth/callback`
- Scopes: `openid email profile offline_access`

## Toolchain

- JDK 17. Set `JAVA_HOME` to a JDK 17 install.
- Android SDK with `platforms;android-35` and `build-tools;35.0.0`. Set `ANDROID_HOME`, or put `sdk.dir` in `android/local.properties`.
- Use the committed Gradle wrapper (`./gradlew`, Gradle 8.11.1). Do not use a system Gradle.

On the maintainer's Mac:

```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@17
export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
```

## Configuration

The build reads each value below from the first source that sets it:

1. A Gradle property (`-PKEY=value`, or `~/.gradle/gradle.properties`).
2. An environment variable.
3. `android/local.properties` (git-ignored).
4. `deploy/.env` (git-ignored). See `deploy/.env.example`.

| Key | Used for | Example |
|---|---|---|
| `STYTCH_ANDROID_CLIENT_ID` | Stytch Connected App `client_id`. Create it with "Android Connected App" in `deploy/phase2-funnel-oauth.md` | `connected-app-live-…` |
| `AUTH_ISSUER` | Stytch issuer for OAuth discovery | `https://<slug>.customers.stytch.dev` |
| `PUBLIC_URL` | Base URL of the public listener for `/api` calls | `https://<host>.<tailnet>.ts.net` |
| `ANDROID_KEYSTORE_PATH` | Release keystore file (`~/` is expanded) | `~/keys/budget-release.jks` |
| `ANDROID_KEYSTORE_PASSWORD` | Release keystore password | |
| `ANDROID_KEY_ALIAS` | Key alias in the keystore | `budget` |
| `ANDROID_KEY_PASSWORD` | Key password | |

Keep the keystore file and its passwords outside the repo. Store them in 1Password.

If a debug build has no `STYTCH_ANDROID_CLIENT_ID`, `AUTH_ISSUER`, or `PUBLIC_URL`, Gradle prints a warning. The app then shows the missing keys instead of "Sign in".

If a release build is missing any key in the table, the `checkReleaseConfig` task stops the build. The error message names each missing key.

### Create the release keystore (one time)

```bash
keytool -genkeypair -v -keystore ~/keys/budget-release.jks \
  -alias budget -keyalg RSA -keysize 4096 -validity 10000
```

Save the file and both passwords in 1Password. Every APK update must use the same key, or Android refuses to install it over the old app.

## Build and test

```bash
cd android
./gradlew assembleDebug testDebugUnitTest   # debug APK + JVM unit tests
./gradlew assembleRelease                   # signed release APK (needs the full configuration)
```

- Debug APK: `app/build/outputs/apk/debug/app-debug.apk`
- Release APK: `app/build/outputs/apk/release/app-release.apk`

Install on a phone over USB with `adb install -r <apk>`.

## Sign-in

1. The app fetches the Stytch OpenID configuration from `AUTH_ISSUER`.
2. AppAuth opens a Custom Tab on the auth page (`/oauth/authorize`) with a PKCE challenge.
3. The Member signs in with an email one-time code and grants consent.
4. Stytch redirects to the relay page `<PUBLIC_URL>/oauth/android-callback`. The page forwards the code to `nz.foster.budget:/oauth/callback`. If the browser does not open the app, the Member taps "Open Budget".
5. AppAuth exchanges the code for tokens.
6. The app encrypts the session (refresh token and access token) with an AES key from Android Keystore. The key survives app restarts and reboots.

The app refreshes the access token when it is within 60 seconds of expiry. If the token endpoint rejects the refresh token, the app clears the session and the cached figure, and shows "Sign in". If the phone cannot reach the token endpoint, the app keeps the session.

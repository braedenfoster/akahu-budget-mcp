# 07: Deploy the route and install on both phones

**What to build:** The `/api` route runs on the Pi, and both Members run the app with the widget on their home screens.

**Blocked by:** 01, 06

**Status:** ready-for-human

Spec: `.scratch/native-android-app/spec.md`

- [x] Deploy the server to the Pi with `deploy.sh`
- [x] From outside the tailnet, `GET /api/spending-allowance` without a token returns 401
- [ ] Build the signed release APK and sideload it on both phones
- [ ] Each Member signs in and adds the widget
- [x] The widget figure equals `get_budget`'s Spending allowance
- [x] With Wi-Fi and mobile data off, the widget shows the offline mark
- [x] After Sign out, the widget shows "Sign in"
- [ ] The next morning, days left has rolled over
- [ ] Keep KWGT installed until ticket 08

## Comments

- 19 Oct 2026: the Pi runs 44c563c. Without a token, `/api/spending-allowance` returns 401 on the public URL.
- 19 Oct 2026, Braeden's phone (Pixel 8 Pro, Android 17): the signed release APK is installed, sign-in works, and the widget is on the home screen. The widget showed $2,506.66, $649.87 / week and 27 days left. `get_budget` returned the same values. The offline mark and "Sign in" after Sign out both showed.
- The release keystore is `~/keys/budget-release.jks` (alias `budget`). The file and password are in 1Password. Its path and passwords are in the git-ignored `deploy/.env`. Certificate SHA-256: `c5d87c150ec9478b970a23030cc1f0b91d48755cad63db0e5a94b1fa91c46ad9`.
- Still open: the second phone, and the days-left rollover on the morning of 20 Oct (expect 26 days left).

# 07: Deploy the route and install on both phones

**What to build:** The `/api` route runs on the Pi, and both Members run the app with the widget on their home screens.

**Blocked by:** 01, 06

**Status:** ready-for-human

Spec: `.scratch/native-android-app/spec.md`

- [ ] Deploy the server to the Pi with `deploy.sh`
- [ ] From outside the tailnet, `GET /api/spending-allowance` without a token returns 401
- [ ] Build the signed release APK and sideload it on both phones
- [ ] Each Member signs in and adds the widget
- [ ] The widget figure equals `get_budget`'s Spending allowance
- [ ] With Wi-Fi and mobile data off, the widget shows the offline mark
- [ ] After Sign out, the widget shows "Sign in"
- [ ] The next morning, days left has rolled over
- [ ] Keep KWGT installed until ticket 08

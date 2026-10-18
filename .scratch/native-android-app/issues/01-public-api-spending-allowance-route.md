# 01: Public `/api/spending-allowance` route

**What to build:** The public OAuth listener serves `GET /api/spending-allowance` behind the same Bearer and email→Member middleware as `/mcp`. It returns the same block `get_budget` returns for the current Period. The tailnet listener does not serve `/api`.

**Blocked by:** none

**Status:** resolved

Spec: `.scratch/native-android-app/spec.md` (Server: public REST routes)

- [x] `GET /api/spending-allowance` on the public listener returns `{ spending_allowance }`
- [x] The block equals `get_budget`'s block for the same Period and clock
- [x] The auth middleware runs before `/api` (today it runs before `POST /mcp` only)
- [x] No token gives 401; a token for an email not attached to a Member gives 403
- [x] The tailnet listener returns 404 for `/api/spending-allowance`
- [x] The route has no logic beyond calling `computeSpendingAllowance` and serializing it
- [x] One HTTP-level test file covers the criteria above

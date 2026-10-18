# 01: Public `/api/spending-allowance` route

**What to build:** The public OAuth listener serves `GET /api/spending-allowance` behind the same Bearer and email→Member middleware as `/mcp`. It returns the same block `get_budget` returns for the current Period. The tailnet listener does not serve `/api`.

**Blocked by:** none

**Status:** ready-for-agent

Spec: `.scratch/native-android-app/spec.md` (Server: public REST routes)

- [ ] `GET /api/spending-allowance` on the public listener returns `{ spending_allowance }`
- [ ] The block equals `get_budget`'s block for the same Period and clock
- [ ] The auth middleware runs before `/api` (today it runs before `POST /mcp` only)
- [ ] No token gives 401; a token for an email not attached to a Member gives 403
- [ ] The tailnet listener returns 404 for `/api/spending-allowance`
- [ ] The route has no logic beyond calling `computeSpendingAllowance` and serializing it
- [ ] One HTTP-level test file covers the criteria above

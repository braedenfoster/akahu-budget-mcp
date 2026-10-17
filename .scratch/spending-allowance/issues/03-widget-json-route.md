# 03: Widget JSON route

**What to build:** A phone widget (e.g. KWGT) on the tailnet can fetch the Spending allowance as plain JSON with no OAuth. The route returns the same block `get_budget` returns, for the current Period resolved in the Household's local time zone. The public OAuth listener does not serve it.

**Blocked by:** 02 (Spending allowance on get_budget)

**Status:** shipped

Spec: `.scratch/spending-allowance/spec.md` (JSON route)

- [x] `GET /widget/summary` on the tailnet listener returns `{ spending_allowance }`
- [x] The block equals `get_budget`'s block for the same Period and clock
- [x] The route resolves the current Period from local today in `household_timezone`
- [x] The public listener does not serve the route
- [x] The route has no logic beyond calling the engine function and serializing it
- [x] One HTTP-level test file covers the criteria above (Seam 2)

# 06: Data rollout on the Pi

**What to build:** The live Household data on the Pi gets the agreed flags and category splits, so the Spending allowance shows a real number. A Member approves each write; the agent performs it through the MCP tools.

**Blocked by:** 01, 02, 03, 04, 05 (all deployed to the Pi)

**Status:** ready-for-human

Spec: `.scratch/spending-allowance/spec.md` (Data rollout)

- [x] Confirm a Budget exists for the current Period; if not, run the create-budget skill
- [x] Mark Flexible: Food, Lifestyle, Household, Transport, Health, Appearance, Professional Services
- [x] Confirm Committed: Housing, Utilities, Education, Savings, Credit Card, Gifts & Holidays
- [x] Create Committed Insurance; preview then apply merchant rules for AIA, Tower, State, IAG, Partners Life, Southern Cross Pet, with backfill
- [x] Create Committed Subscriptions; preview then apply merchant rules for Spotify, Disney+, Netflix, Amazon Prime, Google, Anthropic, with backfill
- [x] Create Committed Home projects with no rules
- [x] Read `get_budget` and check the Spending allowance is plausible
- [ ] Fetch the widget route from the phone over the tailnet

## Rollout log (17 Oct 2026)

The agent performed every write through the tailnet `/mcp` endpoint. The Member approved each write group. The Pi was at `98b2591`.

- Budget 2026-10 already existed.
- The Pi names some things differently from this ticket. The agent used the Pi names:
  - "Credit Card" is `Credit Card Payment`.
  - Merchant rules match exactly. The Pi merchants are `AIA New Zealand`, `Tower Insurance`, `State Insurance`, `IAG`, `Partners Life`, `Southern Cross Pet Insurance`, `Spotify`, `Disney`, `Netflix`, `Amazon Prime`, `Google` and `Anthropic`.
- `Software & AI Tools`, `Bank Fees` and `Transfers` stay committed. The Member chose this.
- New categories: Insurance (id 18), Subscriptions (id 19) and Home projects (id 20).
- The 12 rule backfills moved 224 Transactions. Each count equalled its dry run: 126 from Household, 66 from Lifestyle and 32 from Professional Services.
- The Member approved four extra 2026-10 allocations:
  - Household: 1700 to 1017.
  - Insurance: 0 to 683.
  - Lifestyle: 200 to 124.
  - Subscriptions: 0 to 76.16.
- Allowance: -$1,216.94 at the start, +$235.46 after the flags (the rules did not change it), and -$213.96 `over` after the allocations. The -$213.96 is Lifestyle's $1,191 overspend, offset by the other flexible Envelopes' remainders, plus $7.79 of Software & AI Tools overspend.
- From the Mac, `GET /widget/summary` over the tailnet returned 200 and the same block as `get_budget`. The public Funnel path returned 404.
- Open: fetch the widget route from the phone.
- The phone browser upgraded the HTTP widget URL to HTTPS 443, which is the public Funnel listener, and got `Cannot GET /widget/summary`. The agent added tailnet-only HTTPS on port 8443 for `/widget` only. The widget URL is `https://pixelsprout-1.tail8d66c9.ts.net:8443/widget/summary`. From the public internet, port 8443 cannot be reached.

# 06: Data rollout on the Pi

**What to build:** The live Household data on the Pi gets the agreed flags and category splits, so the Spending allowance shows a real number. A Member approves each write; the agent performs it through the MCP tools.

**Blocked by:** 01, 02, 03, 04, 05 (all deployed to the Pi)

**Status:** ready-for-human

Spec: `.scratch/spending-allowance/spec.md` (Data rollout)

- [ ] Confirm a Budget exists for the current Period; if not, run the create-budget skill
- [ ] Mark Flexible: Food, Lifestyle, Household, Transport, Health, Appearance, Professional Services
- [ ] Confirm Committed: Housing, Utilities, Education, Savings, Credit Card, Gifts & Holidays
- [ ] Create Committed Insurance; preview then apply merchant rules for AIA, Tower, State, IAG, Partners Life, Southern Cross Pet, with backfill
- [ ] Create Committed Subscriptions; preview then apply merchant rules for Spotify, Disney+, Netflix, Amazon Prime, Google, Anthropic, with backfill
- [ ] Create Committed Home projects with no rules
- [ ] Read `get_budget` and check the Spending allowance is plausible
- [ ] Fetch the widget route from the phone over the tailnet

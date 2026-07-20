# 08 — get_period_summary (reports)

**What to build:** The Household can get a structured summary of a Period that the AI renders and answers follow-ups on — spend vs budget, income vs spend, top merchants, and trend versus prior months (using the accumulated history). See ADR-0003 (structured, AI-rendered) and `CONTEXT.md`.

**Blocked by:** 05.

**Status:** ready-for-agent

- [ ] `get_period_summary(period)` returns structured data: per-Budget-Category spend vs allocated, total income vs total spend, top merchants by spend, and a trend series versus prior Periods.
- [ ] Trend uses retained history (never-delete); Periods with no budget still summarize actual spend.
- [ ] Output is data only (no prose) with a `data-as-of` stamp; the AI does the rendering.
- [ ] Seam 1 tests assert exact aggregates against seeded multi-month fixtures, including a month with no budget and a month with Uncategorized spend.

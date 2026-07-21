# 06 — evaluate_purchase (advisory verdict)

**What to build:** The Household can ask "can we afford this $X purchase in category Y?" and get a structured, read-only verdict the AI can reason over — target Envelope remaining, whether it fits, the shortfall if not, a ranked list of other Envelopes with reallocatable Slack, Household headroom, and days left in the Period. See ADR-0003 and `CONTEXT.md` (Evaluate purchase, Slack, headroom).

**Blocked by:** 05.

**Status:** shipped — implemented on `main` (commit 2bc90cb).

- [x] `evaluate_purchase(amount, category_id?)` returns: target Envelope + remaining, fit verdict (fits / fits-if-reallocated / doesn't-fit) + shortfall, **ranked reallocatable Slack** `{category, slack_amount}`, Household headroom, days left, `data-as-of`.
- [x] The tool is strictly **read-only** — it never mutates budget state.
- [x] With no `category_id`, it evaluates against Household headroom only (no target Envelope).
- [x] Seam 1 tests cover: comfortably fits; fits only via reallocation; doesn't fit at all; no-category case — all asserting exact integer-cent figures.

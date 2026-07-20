# Hybrid intelligence: the server owns all money math, the LLM never does arithmetic

The budgeting logic is split so the **server computes every number** (spent, remaining, income, slack, headroom, purchase verdicts) deterministically from sqlite, and the **LLM supplies only judgment** (which trade-offs to propose, phrasing, guiding the flow). Analytical tools like `evaluate_purchase` and `plan_period` return **structured data, not prose**. The anchoring rule is: *the LLM never does arithmetic on money.*

## Considered Options

- **Thin tools, fat client** — LLM sums transaction lists itself. Rejected: subtly wrong in a different way each time, and the two front-ends would compute differently.
- **Fat tools, thin client** — server returns finished prose answers. Rejected: rigid; every new "what if" needs new server code.

## Consequences

- Numbers are byte-identical regardless of which AI (Claude or ChatGPT) asks.
- The financial core is pure functions over data, so it is exhaustively unit-testable (see ADR-0005) — and is the focus of test effort. The LLM's judgment layer is deliberately not unit-tested.
- Every write (categorize, reallocate, set allocation, planned-purchase mutations) is explicit and confirmed in-conversation; reads carry a data-as-of stamp.

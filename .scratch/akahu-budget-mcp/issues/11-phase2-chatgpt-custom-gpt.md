# 11 — Phase 2: ChatGPT custom GPT

**What to build:** The ChatGPT Member gets a custom GPT that connects to the OAuth'd endpoint and walks the same guided flows via `get_workflow_guide` — parity with the Claude Member. See ADR-0002/0006.

**Blocked by:** 10.

**Status:** ready-for-agent

- [ ] A ChatGPT custom GPT (developer-mode MCP connector) connects to the public `/mcp` endpoint and completes the OAuth flow.
- [ ] The GPT's instructions drive the four flows by calling `get_workflow_guide` and following the returned steps — no budgeting logic duplicated in the GPT.
- [ ] The ChatGPT Member can create a budget, categorize, evaluate a purchase, weigh the wishlist, and get a report — matching the Claude experience against the same shared budget.
- [ ] Setup steps (enabling developer mode, adding the connector, signing in) are documented.

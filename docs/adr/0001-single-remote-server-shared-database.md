# Single remote server with one shared database

The budget is shared across household Members, but the two Members use **different** AI front-ends (Claude and ChatGPT), and ChatGPT can only reach **remote HTTPS** MCP servers (its connectors are fetched by OpenAI's servers, not the user's device). Two local installs would give two diverging budgets and ChatGPT couldn't reach a local stdio server anyway. We therefore run **one MCP server against one shared database**, and every front-end connects to it — rather than a per-user local tool.

## Consequences

- The server speaks HTTP transport from day one; there is no local-only mode.
- "Shared budget" is a first-class constraint: budgets are Household-scoped and never per-Member.
- Networking and (eventually) auth are load-bearing — see ADR-0002.

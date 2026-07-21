# 01 — Walking skeleton: MCP server + sqlite + write-safety infra

**What to build:** A runnable MCP server that a caller can reach over Streamable HTTP, invoke a trivial read tool and a trivial write tool, and get structured data back — with the sqlite layer, migrations, test harness, and cross-cutting write-safety mechanism all in place so every later ticket plugs into an established spine. See ADR-0008 (stack), ADR-0003 (structured outputs), ADR-0005 (storage) and `CONTEXT.md`.

**Blocked by:** None — can start immediately.

**Status:** shipped — implemented on `main` (commit 8d347d8).

- [x] MCP server (`@modelcontextprotocol/sdk`) runs over Streamable HTTP transport and is reachable locally.
- [x] better-sqlite3 + Drizzle configured with a migration runner that applies on startup; `settings` and `audit_log` tables exist.
- [x] A `settings` read tool returns structured data including a `data-as-of`-style stamp convention; a trivial write tool (e.g. set a setting) demonstrates the write path.
- [x] A shared **write wrapper** exists that every write goes through: it appends to `audit_log` and refuses when the `read_only` setting is on.
- [x] Seam 1 test harness (`vitest`): seed a temp sqlite → invoke a tool → assert structured output. At least one read and one write test pass, including a test proving `read_only` blocks the write and logs nothing.
- [x] Money helpers assume integer minor units + currency (no floats) per ADR-0005.
- [x] Run scripts and a systemd unit file (or documented equivalent) for the Pi; secrets loaded from `.env` via dotenv and never logged.

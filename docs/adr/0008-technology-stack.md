# Technology stack

TypeScript on Node.js 22, the official `@modelcontextprotocol/sdk` over **Streamable HTTP** transport, **better-sqlite3** as the sqlite driver with **Drizzle** for typed schema + migrations, `node-cron` for the nightly sync, `zod` for tool input schemas, `vitest` for tests, pnpm, and a systemd service on the Pi.

## Considered Options

- **`node:sqlite` (built-in)** over better-sqlite3 — rejected for now: still experimental, and we won't bet financial data on it.
- **Pure SQL + a tiny migration runner** over Drizzle — Drizzle wins for a wide, still-evolving schema (accounts/transactions/envelopes/mapping-rules/planned-purchases), but we **drop to hand-written SQL for heavy aggregations** (envelope rollups, period summaries).
- **A separate systemd timer** for the nightly sync — rejected in favour of in-process `node-cron`, since the server is always running: one process to reason about.

## Consequences

- better-sqlite3 is a native module but compiles cleanly on the Pi's ARM Linux.
- Streamable HTTP (not the deprecated SSE transport) is used from day one, so Phase 2's public exposure adds only a door and a lock, no transport rework.

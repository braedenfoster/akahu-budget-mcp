# 02 — Connections + Akahu client port + account sync + list_accounts

**What to build:** From Akahu credentials in `.env`, the Household's Accounts appear via a `list_accounts` tool showing balances across all Connections with a freshness stamp — backed by a sync that pulls Accounts and captures a daily balance snapshot. Establishes the `AkahuClient` port (Seam 2). See ADR-0001/0002 (household model), ADR-0005 (snapshots) and `CONTEXT.md` (Household/Member/Connection/Account).

**Blocked by:** 01.

**Status:** shipped — implemented on `main` (commit 9dd46ad).

- [x] `households`, `members`, `connections`, `accounts`, `balance_snapshots` tables exist (Drizzle migration).
- [x] Household/Member/Connection are populated from N Akahu token pairs in `.env`; each Account records its `connection_id` → `member_id` lineage.
- [x] An `AkahuClient` **interface** exists with a live HTTP implementation; the sync engine depends on the interface, not the concrete client (Seam 2).
- [x] An account sync pulls Accounts for every Connection into sqlite and writes one `balance_snapshots` row per Account per run.
- [x] `list_accounts` returns all Accounts across Connections with balances, Member attribution, and a `data-as-of` stamp.
- [x] Seam 2 tests: inject sanitized recorded Akahu account responses through the interface and assert Accounts + snapshots land correctly. No live Akahu calls in tests. Credentials never appear in tool output or logs.
